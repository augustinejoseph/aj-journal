const supported = /^image\/(jpeg|png|webp|heic|heif)$/;
export function photoDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Invalid photo dimensions.");
  const scale = Math.min(1, 3840 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function validatePhoto(blob: Blob) {
  if (!supported.test(blob.type))
    throw new Error("Choose a JPEG, PNG, WebP, HEIC or HEIF photo.");
  if (!blob.size) throw new Error("Photo is empty. Choose another image.");
  if (blob.size > 25000000)
    throw new Error("Photo exceeds the 25 MB limit. Choose a smaller image.");
  return blob;
}
export function nextPhotoSequence(
  server: { kind: string; sequence: number }[],
  local: { kind: string; sequence: number }[],
) {
  return (
    Math.max(
      -1,
      ...[...server, ...local]
        .filter((m) => m.kind === "photo")
        .map((m) => m.sequence),
    ) + 1
  );
}
export async function optimizePhoto(file: File): Promise<Blob> {
  if (!supported.test(file.type)) return validatePhoto(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return validatePhoto(file);
  }
  try {
    const size = photoDimensions(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && size.height === bitmap.height)
      return validatePhoto(file);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return validatePhoto(file);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    // Preserve possible transparency in PNG/WebP. Decodable HEIC/HEIF
    // photos use JPEG, since canvas cannot encode those source formats.
    const mime =
      file.type === "image/png" || file.type === "image/webp"
        ? file.type
        : "image/jpeg";
    if (mime === "image/jpeg") {
      context.fillStyle = "white";
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      if (mime === "image/png") canvas.toBlob(resolve, mime);
      else canvas.toBlob(resolve, mime, 0.9);
    });
    // Some browsers silently return PNG for unsupported encoders.
    // Reject that fallback, empty output, and any increase in file size.
    return validatePhoto(
      blob && blob.type === mime && blob.size > 0 && blob.size < file.size
        ? blob
        : file,
    );
  } catch {
    // Canvas allocation, drawing and encoding can fail on mobile devices.
    return validatePhoto(file);
  } finally {
    bitmap.close();
  }
}

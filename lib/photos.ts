const supported = /^image\/(jpeg|png|webp|heic|heif)$/;
export function photoDimensions(width: number, height: number) {
  const scale = Math.min(1, 3840 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function validatePhoto(blob: Blob) {
  if (!supported.test(blob.type))
    throw new Error("Choose a JPEG, PNG, WebP, HEIC or HEIF photo.");
  if (!blob.size || blob.size > 25000000)
    throw new Error(
      "Photo exceeds the 25 MB limit. Choose a smaller image; quality was not reduced.",
    );
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
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    return validatePhoto(blob ?? file);
  } finally {
    bitmap.close();
  }
}

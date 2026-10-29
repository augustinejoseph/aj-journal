import { afterEach, expect, it, vi } from "vitest";
import {
  nextPhotoSequence,
  optimizePhoto,
  photoDimensions,
  validatePhoto,
} from "../lib/photos";
afterEach(() => vi.unstubAllGlobals());
it("fits landscape and portrait images to 4K without upscaling", () => {
  expect(photoDimensions(7680, 4320)).toEqual({ width: 3840, height: 2160 });
  expect(photoDimensions(4320, 7680)).toEqual({ width: 2160, height: 3840 });
  expect(photoDimensions(800, 600)).toEqual({ width: 800, height: 600 });
});
it("allocates after local pending photos and uploaded photos, ignoring audio", () => {
  expect(
    nextPhotoSequence(
      [
        { kind: "photo", sequence: 2 },
        { kind: "audio", sequence: 99 },
      ],
      [{ kind: "photo", sequence: 5 }],
    ),
  ).toBe(6);
});
it("rejects unsupported, empty and oversized images without lossy fallback", () => {
  expect(() => validatePhoto(new Blob(["x"], { type: "image/gif" }))).toThrow(
    "Choose a JPEG",
  );
  expect(() => validatePhoto(new Blob([], { type: "image/png" }))).toThrow(
    "25 MB",
  );
  expect(() =>
    validatePhoto({ type: "image/png", size: 25000001 } as Blob),
  ).toThrow("25 MB");
});
it("retains an undecodable supported original", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockRejectedValue(new Error("unsupported")),
  );
  const photo = new File(["heic"], "photo.heic", { type: "image/heic" });
  expect(await optimizePhoto(photo)).toBe(photo);
});
it("applies orientation and high quality resizing, and requests lossless transparent PNG", async () => {
  const close = vi.fn();
  const decode = vi
    .fn()
    .mockResolvedValue({ width: 4320, height: 7680, close });
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    drawImage: vi.fn(),
  };
  const output = new Blob(["png"], { type: "image/png" });
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: (blob: Blob) => void) => callback(output)),
  };
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", { createElement: () => canvas });
  const input = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  expect(await optimizePhoto(input)).toBe(output);
  expect(decode).toHaveBeenCalledWith(input, {
    imageOrientation: "from-image",
  });
  expect(canvas.width).toBe(2160);
  expect(canvas.height).toBe(3840);
  expect(context.imageSmoothingQuality).toBe("high");
  expect(canvas.getContext).toHaveBeenCalledWith("2d");
  expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  expect(close).toHaveBeenCalled();
});
it("preserves small images byte for byte", async () => {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1000, height: 500, close }),
  );
  const input = new File(["photo"], "photo.webp", { type: "image/webp" });
  expect(await optimizePhoto(input)).toBe(input);
  expect(close).toHaveBeenCalled();
});

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
it("rejects unsupported, empty and oversized images", () => {
  expect(() => validatePhoto(new Blob(["x"], { type: "image/gif" }))).toThrow(
    "Choose a JPEG",
  );
  expect(() => validatePhoto(new Blob([], { type: "image/png" }))).toThrow(
    "empty",
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
function setupResize(
  width = 4320,
  height = 7680,
  output: Blob | null = new Blob(["jpg"], { type: "image/jpeg" }),
) {
  const close = vi.fn();
  const decode = vi.fn().mockResolvedValue({ width, height, close });
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(output)),
  };
  const createElement = vi.fn().mockReturnValue(canvas);
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", { createElement });
  return { close, decode, context, canvas, createElement, output };
}
it.each(["jpeg", "heic", "heif"])(
  "resizes oversized %s photos as JPEG 90%% with orientation and smoothing",
  async (format) => {
    const { output, close, decode, canvas, context } = setupResize();
    const input = new File(["photo"], `photo.${format}`, {
      type: `image/${format}`,
    });
    expect(await optimizePhoto(input)).toBe(output);
    expect(decode).toHaveBeenCalledWith(input, {
      imageOrientation: "from-image",
    });
    expect(canvas.width).toBe(2160);
    expect(canvas.height).toBe(3840);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.fillStyle).toBe("white");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2160, 3840);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4320, height: 7680 }),
      0,
      0,
      2160,
      3840,
    );
    expect(canvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.9,
    );
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each(["png", "webp"])(
  "preserves %s encoding and canvas transparency",
  async (format) => {
    const output = new Blob(["out"], { type: `image/${format}` });
    const { canvas, context, close } = setupResize(8000, 6000, output);
    const input = new File(["photo"], `photo.${format}`, {
      type: `image/${format}`,
    });
    expect(await optimizePhoto(input)).toBe(output);
    expect(context.fillRect).not.toHaveBeenCalled();
    if (format === "png")
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/png",
      );
    else
      expect(canvas.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        "image/webp",
        0.9,
      );
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each(["jpeg", "png", "webp", "heic", "heif"])(
  "preserves %s photos at or below the limit byte for byte",
  async (format) => {
    for (const [width, height] of [
      [1000, 500],
      [3840, 2160],
      [2160, 3840],
      [3160, 3160],
    ]) {
      const { createElement, close } = setupResize(width, height);
      const input = new File(["photo"], `photo.${format}`, {
        type: `image/${format}`,
      });
      expect(await optimizePhoto(input)).toBe(input);
      expect(createElement).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    }
  },
);
it.each([0, 5, 20, 25000001, null])(
  "retains the original for empty, equal, larger or absent output (size %s)",
  async (size) => {
    const output =
      size === null
        ? null
        : new Blob([new Uint8Array(size)], { type: "image/jpeg" });
    const { close } = setupResize(8000, 6000, output);
    const input = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    expect(await optimizePhoto(input)).toBe(input);
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each(["jpeg", "webp"])(
  "retains %s original if the encoder silently falls back to PNG",
  async (format) => {
    const { close } = setupResize(
      8000,
      6000,
      new Blob(["x"], { type: "image/png" }),
    );
    const input = new File(["photo"], `photo.${format}`, {
      type: `image/${format}`,
    });
    expect(await optimizePhoto(input)).toBe(input);
    expect(close).toHaveBeenCalledOnce();
  },
);
it.each(["allocation", "context", "drawing", "encoding"])(
  "retains original on canvas %s failure",
  async (failure) => {
    const { createElement, canvas, context, close } = setupResize();
    const fail = () => {
      throw new Error("Canvas failed");
    };
    if (failure === "allocation") createElement.mockImplementation(fail);
    if (failure === "context") canvas.getContext.mockReturnValue(null);
    if (failure === "drawing") context.drawImage.mockImplementation(fail);
    if (failure === "encoding") canvas.toBlob.mockImplementation(fail);
    const input = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    expect(await optimizePhoto(input)).toBe(input);
    expect(close).toHaveBeenCalledOnce();
  },
);
it("keeps a valid original when bitmap decoding is unavailable", async () => {
  vi.stubGlobal("createImageBitmap", undefined);
  const input = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  expect(await optimizePhoto(input)).toBe(input);
});
it.each([
  [0, 20],
  [20, 0],
  [-1, 20],
  [Infinity, 20],
  [20, NaN],
])(
  "rejects invalid dimensions %s x %s and retains a valid original",
  async (width, height) => {
    expect(() => photoDimensions(width, height)).toThrow(
      "Invalid photo dimensions",
    );
    const { close } = setupResize(width, height);
    const input = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
    expect(await optimizePhoto(input)).toBe(input);
    expect(close).toHaveBeenCalledOnce();
  },
);
it("enforces the upload limit on the selected result, allowing an oversized source to shrink", async () => {
  const { output } = setupResize();
  const input = new File([new Uint8Array(25000001)], "large.jpg", {
    type: "image/jpeg",
  });
  expect(await optimizePhoto(input)).toBe(output);
  setupResize(1000, 500);
  await expect(optimizePhoto(input)).rejects.toThrow("25 MB");
  setupResize(8000, 6000, null);
  await expect(optimizePhoto(input)).rejects.toThrow("25 MB");
  setupResize(
    8000,
    6000,
    new Blob([new Uint8Array(25000001)], { type: "image/jpeg" }),
  );
  await expect(optimizePhoto(input)).rejects.toThrow("25 MB");
});
it("rejects unsupported files before decoding and accepts the exact upload limit", async () => {
  const { decode } = setupResize();
  await expect(
    optimizePhoto(new File(["gif"], "photo.gif", { type: "image/gif" })),
  ).rejects.toThrow("Choose a JPEG");
  expect(decode).not.toHaveBeenCalled();
  const atLimit = new Blob([new Uint8Array(25000000)], { type: "image/jpeg" });
  expect(validatePhoto(atLimit)).toBe(atLimit);
});

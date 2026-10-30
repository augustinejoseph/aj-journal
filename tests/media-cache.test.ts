import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn(), getChunk: vi.fn() }));
vi.mock("../lib/api", () => ({ api: m.api }));
vi.mock("../lib/local", () => ({ local: { getChunk: m.getChunk } }));
import { clearMediaCache, mediaBlob } from "../lib/media-cache";
let records: Map<string, Response>;
let fetchMedia: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetAllMocks();
  records = new Map();
  vi.stubGlobal("window", { location: { origin: "https://diary.example" } });
  const cache = {
    keys: async () => [...records.keys()].map((url) => new Request(url)),
    match: async (key: string | Request) =>
      records.get(typeof key === "string" ? key : key.url)?.clone(),
    put: async (key: string, response: Response) => {
      records.set(key, response);
    },
    delete: async (key: string | Request) =>
      records.delete(typeof key === "string" ? key : key.url),
  };
  vi.stubGlobal("caches", {
    open: async () => cache,
    delete: async () => {
      records.clear();
      return true;
    },
  });
  fetchMedia = vi
    .fn()
    .mockImplementation(
      async () => new Response(new Blob(["photo"], { type: "image/jpeg" })),
    );
  vi.stubGlobal("fetch", fetchMedia);
  m.api.mockResolvedValue({ url: "https://r2.example/signed" });
  m.getChunk.mockResolvedValue(undefined);
  await clearMediaCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("downloads once and reuses persisted bytes even when signed URLs change", async () => {
  expect(await (await mediaBlob("entry", "photo")).text()).toBe("photo");
  m.api.mockResolvedValue({ url: "https://r2.example/new-signature" });
  expect(await (await mediaBlob("entry", "photo")).text()).toBe("photo");
  expect(fetchMedia).toHaveBeenCalledTimes(1);
  expect(m.api).toHaveBeenCalledTimes(2);
});
it("coalesces concurrent requests for the same media", async () => {
  await Promise.all([mediaBlob("entry", "photo"), mediaBlob("entry", "photo")]);
  expect(fetchMedia).toHaveBeenCalledTimes(1);
});
it("reuses uploaded local originals without reading R2", async () => {
  m.getChunk.mockResolvedValue({
    entryId: "entry",
    uploaded: true,
    blob: new Blob(["audio"]),
  });
  expect(await (await mediaBlob("entry", "audio")).text()).toBe("audio");
  expect(fetchMedia).not.toHaveBeenCalled();
  expect(m.api).toHaveBeenCalledTimes(1);
});
it("does not expose cached content when authorization fails", async () => {
  await mediaBlob("entry", "photo");
  m.api.mockRejectedValue(new Error("Unauthorized"));
  await expect(mediaBlob("entry", "photo")).rejects.toThrow("Unauthorized");
  expect(fetchMedia).toHaveBeenCalledTimes(1);
});
it("evicts entry bytes on deletion and all bytes on logout", async () => {
  await mediaBlob("one", "photo");
  await mediaBlob("two", "photo");
  await clearMediaCache("one");
  expect(records.size).toBe(1);
  await clearMediaCache();
  expect(records.size).toBe(0);
});
it("falls back to downloading if browser cache storage is unavailable", async () => {
  vi.stubGlobal("caches", {
    open: async () => {
      throw new Error("blocked");
    },
  });
  expect(await (await mediaBlob("entry", "photo")).text()).toBe("photo");
});
it("expires downloaded bytes after ninety days", async () => {
  vi.useFakeTimers();
  await mediaBlob("entry", "photo");
  vi.setSystemTime(Date.now() + 91 * 86400000);
  await mediaBlob("entry", "photo");
  expect(fetchMedia).toHaveBeenCalledTimes(2);
});
it("does not cache failed downloads and allows retry", async () => {
  fetchMedia.mockResolvedValueOnce(new Response("failed", { status: 500 }));
  await expect(mediaBlob("entry", "photo")).rejects.toThrow(
    "Media download failed",
  );
  expect(records.size).toBe(0);
  await mediaBlob("entry", "photo");
  expect(records.size).toBe(1);
});

it("evicts oldest downloaded media to stay within the cache budget", async () => {
  const key = "https://diary.example/__private-media/old/photo";
  records.set(
    key,
    new Response("old", {
      headers: {
        "Content-Length": String(256 * 1024 * 1024),
        "X-Cached-At": String(Date.now()),
      },
    }),
  );
  await mediaBlob("entry", "photo");
  expect(records.has(key)).toBe(false);
  expect(records.size).toBe(1);
});
it("does not repopulate the cache with an in-flight download after logout", async () => {
  let finish!: (response: Response) => void;
  let started!: () => void;
  const downloading = new Promise<void>((resolve) => {
    started = resolve;
  });
  fetchMedia.mockImplementationOnce(() => {
    started();
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const request = mediaBlob("entry", "photo");
  await downloading;
  await clearMediaCache();
  finish(new Response("photo"));
  await expect(request).rejects.toThrow("cancelled");
  expect(records.size).toBe(0);
});

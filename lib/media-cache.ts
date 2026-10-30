import { api } from "./api";
import { local } from "./local";

const CACHE = "diary-private-media-v1";
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_AGE = 90 * 24 * 60 * 60 * 1000;
const pending = new Map<string, Promise<Blob>>();
let generation = 0;
let writes: Promise<void> = Promise.resolve();
const keyFor = (entryId: string, mediaId: string) =>
  `${window.location.origin}/__private-media/${entryId}/${mediaId}`;

async function cacheStore() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function save(cache: Cache, key: string, blob: Blob, epoch: number) {
  if (blob.size > MAX_BYTES || epoch !== generation) return;
  const records = await cache.keys();
  let size = blob.size;
  const retained: { key: Request; size: number }[] = [];
  for (const request of records) {
    const response = await cache.match(request);
    if (!response) continue;
    const bytes = Number(response.headers.get("Content-Length"));
    if (Date.now() - Number(response.headers.get("X-Cached-At")) > MAX_AGE) {
      await cache.delete(request);
    } else {
      size += bytes;
      retained.push({ key: request, size: bytes });
    }
  }
  for (const record of retained) {
    if (size <= MAX_BYTES) break;
    await cache.delete(record.key);
    size -= record.size;
  }
  if (epoch !== generation) return;
  await cache.put(
    key,
    new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Length": String(blob.size),
        "X-Cached-At": String(Date.now()),
      },
    }),
  );
  if (epoch !== generation) await cache.delete(key);
}

// Reauthorize every read through the app; signing a URL makes no R2 request.
// Only the bytes are cached, never signed URLs or authentication responses.
export function mediaBlob(entryId: string, mediaId: string): Promise<Blob> {
  const key = keyFor(entryId, mediaId);
  const existing = pending.get(key);
  if (existing) return existing;
  const epoch = generation;
  const request = (async () => {
    const { url } = await api<{ url: string }>(
      `entries/${entryId}/media/${mediaId}`,
    );
    if (epoch !== generation) throw new Error("Media request cancelled.");
    const original = await local.getChunk(mediaId).catch(() => undefined);
    if (original?.entryId === entryId && original.uploaded)
      return original.blob;
    const cache = await cacheStore();
    const cached = await cache?.match(key).catch(() => undefined);
    if (
      cached &&
      Date.now() - Number(cached.headers.get("X-Cached-At")) <= MAX_AGE
    )
      return cached.blob();
    const response = await fetch(url);
    if (!response.ok) throw new Error("Media download failed. Try again.");
    const blob = await response.blob();
    if (epoch !== generation) throw new Error("Media request cancelled.");
    if (cache) {
      writes = writes.then(() => save(cache, key, blob, epoch)).catch(() => {});
      await writes;
    }
    return blob;
  })();
  pending.set(key, request);
  void request
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    })
    .catch(() => {});
  return request;
}

export async function clearMediaCache(entryId?: string) {
  generation++;
  pending.clear();
  try {
    if (!entryId) {
      await caches.delete(CACHE);
      return;
    }
    const cache = await cacheStore();
    for (const key of (await cache?.keys()) ?? [])
      if (new URL(key.url).pathname.startsWith(`/__private-media/${entryId}/`))
        await cache?.delete(key);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

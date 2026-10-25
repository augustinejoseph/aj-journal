import { api } from "./api";
import { local, LocalSession, LocalChunk } from "./local";
import { Entry, Media } from "./schema";
import { transcribe } from "./transcription";
export async function uploadChunk(c: LocalChunk) {
  const result = await api<{ url: string | null; uploaded: boolean }>(
    `entries/${c.entryId}/media`,
    "POST",
    {
      id: c.id,
      kind: c.kind,
      sequence: c.sequence,
      mime: c.blob.type,
      size: c.blob.size,
    },
  );
  if (!result.uploaded) {
    const response = await fetch(result.url!, {
      method: "PUT",
      body: c.blob,
      headers: { "Content-Type": c.blob.type },
    });
    if (!response.ok)
      throw new Error("Upload interrupted. Audio remains on this device.");
    await api(`entries/${c.entryId}/media/${c.id}`, "POST", {});
  }
  await local.chunk({ ...c, uploaded: true });
}
export async function syncSession(s: LocalSession) {
  try {
    await api("entries", "POST", { id: s.id, createdAt: s.createdAt });
    const chunks = await local.chunks(s.id);
    for (const c of chunks.sort((a, b) => a.sequence - b.sequence)) {
      if (!c.uploaded) await uploadChunk(c);
    }
    if (s.stopped)
      await api(`entries/${s.id}/seal`, "POST", { count: s.count });
  } catch (error) {
    await api(`entries/${s.id}/upload-failure`, "POST", {
      error:
        error instanceof Error
          ? error.message
          : "Upload failed. Retry from the recording device.",
    }).catch(() => {});
    throw error;
  }
}
export async function processEntry(
  entry: Entry,
  progress: (s: string) => void,
) {
  if (!entry.sealed) return;
  if (entry.transcription !== "complete") {
    const { token } = await api<{ token: string | null }>(
      `entries/${entry.id}/transcription`,
      "POST",
      {},
    );
    if (!token) {
      progress(
        "This recording is already being transcribed in another tab or device.",
      );
      return;
    }
    const heartbeat = setInterval(() => {
      api(`entries/${entry.id}/transcription`, "PUT", { token }).catch(
        () => {},
      );
    }, 30000);
    try {
      const detail = await api<Entry & { media: Media[] }>(
        `entries/${entry.id}`,
      );
      const chunks = detail.media
        .filter((m) => m.kind === "audio")
        .sort((a, b) => a.sequence - b.sequence);
      const blobs: Blob[] = [];
      for (const chunk of chunks) {
        const { url } = await api<{ url: string }>(
          `entries/${entry.id}/media/${chunk.id}`,
        );
        const res = await fetch(url);
        if (!res.ok) throw new Error("Audio download failed");
        blobs.push(await res.blob());
      }
      progress("Preparing audio…");
      const transcript = await transcribe(
        new Blob(blobs, { type: chunks[0]?.mime }),
        progress,
      );
      if (!transcript.trim())
        throw new Error("No speech detected. Audio is preserved for retry.");
      await api(`entries/${entry.id}/transcript`, "POST", {
        transcript,
        token,
      });
    } catch (error) {
      await api(`entries/${entry.id}/failure`, "POST", {
        token,
        error: error instanceof Error ? error.message : "Transcription failed",
      }).catch(() => {});
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
  if (entry.writing !== "complete") {
    progress("Writing your diary entry…");
    await api(`entries/${entry.id}/generate`, "POST", {});
  }
}
export async function exclusive<T>(fn: () => Promise<T>) {
  if (navigator.locks)
    return navigator.locks.request(
      "diary-processing",
      { ifAvailable: true },
      (lock) => (lock ? fn() : Promise.resolve(undefined)),
    );
  return fn();
}

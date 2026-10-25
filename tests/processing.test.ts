import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  api: vi.fn(),
  chunk: vi.fn(),
  chunks: vi.fn(),
  transcribe: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api: m.api }));
vi.mock("../lib/local", () => ({
  local: { chunk: m.chunk, chunks: m.chunks },
}));
vi.mock("../lib/transcription", () => ({ transcribe: m.transcribe }));
import { uploadChunk, syncSession, processEntry } from "../lib/processing";
import type { Entry } from "../lib/schema";
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("does not upload a completed chunk again", async () => {
  m.api.mockResolvedValue({ uploaded: true, url: null });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await uploadChunk({
    id: "chunk",
    entryId: "entry",
    sequence: 0,
    kind: "audio",
    blob: new Blob(["audio"], { type: "audio/webm" }),
    uploaded: false,
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(m.chunk).toHaveBeenCalledWith(
    expect.objectContaining({ uploaded: true }),
  );
});
it("keeps local data pending after network failure", async () => {
  m.api.mockResolvedValue({ uploaded: false, url: "https://storage.example" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 503 })),
  );
  await expect(
    uploadChunk({
      id: "chunk",
      entryId: "entry",
      sequence: 0,
      kind: "audio",
      blob: new Blob(["audio"]),
      uploaded: false,
    }),
  ).rejects.toThrow("remains on this device");
  expect(m.chunk).not.toHaveBeenCalled();
});
it("retry only uploads unfinished chunks and seals after upload", async () => {
  m.chunks.mockResolvedValue([{ uploaded: true, sequence: 0 }]);
  m.api.mockResolvedValue({});
  await syncSession({
    id: "entry",
    createdAt: "today",
    stopped: true,
    count: 1,
  });
  expect(m.api.mock.calls.map((c) => c[0])).toEqual([
    "entries",
    "entries/entry/seal",
  ]);
});
it("completed work is skipped", async () => {
  await processEntry(
    { sealed: true, transcription: "complete", writing: "complete" } as Entry,
    vi.fn(),
  );
  expect(m.api).not.toHaveBeenCalled();
  expect(m.transcribe).not.toHaveBeenCalled();
});
it("does not transcribe an unsealed recording", async () => {
  await processEntry({ sealed: false } as Entry, vi.fn());
  expect(m.api).not.toHaveBeenCalled();
});

it("does not duplicate transcription when another device holds the lease", async () => {
  m.api.mockResolvedValue({ token: null });
  await processEntry(
    {
      id: "entry",
      sealed: true,
      transcription: "processing",
      writing: "pending",
    } as Entry,
    vi.fn(),
  );
  expect(m.api).toHaveBeenCalledTimes(1);
  expect(m.transcribe).not.toHaveBeenCalled();
});
it("keeps source intact when transcription fails and releases its lease", async () => {
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith("/transcription")) return { token: "lease" };
    if (path === "entries/entry") return { media: [] };
    return {};
  });
  m.transcribe.mockRejectedValue(new Error("out of memory"));
  await expect(
    processEntry(
      {
        id: "entry",
        sealed: true,
        transcription: "pending",
        writing: "pending",
      } as Entry,
      vi.fn(),
    ),
  ).rejects.toThrow("out of memory");
  expect(m.api).toHaveBeenCalledWith("entries/entry/failure", "POST", {
    token: "lease",
    error: "out of memory",
  });
  expect(m.api.mock.calls.some((c) => c[0] === "entries/entry/generate")).toBe(
    false,
  );
});

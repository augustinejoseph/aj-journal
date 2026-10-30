import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { GET, POST, DELETE } from "../app/api/[...path]/route";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOWED_EMAIL = "owner@example.com";
});
it.each([
  ["entries"],
  ["settings"],
  ["entries", "123", "media", "456"],
  ["entries", "123", "generate"],
])("protects anonymous endpoint %j", async (...path) => {
  mocks.auth.mockResolvedValue(null);
  const response = await GET(
    new Request("https://diary.example/api/" + path.join("/")),
    ctx(path),
  );
  expect(response.status).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("rejects an authenticated non-owner before accessing data", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "attacker@example.com" } });
  expect(
    (
      await DELETE(
        new Request("https://diary.example/api/entries/123", {
          method: "DELETE",
        }),
        ctx(["entries", "123"]),
      )
    ).status,
  ).toBe(401);
});
it("rejects cross-origin writes from the owner session", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const res = await POST(
    new Request("https://diary.example/api/entries", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }),
    ctx(["entries"]),
  );
  expect(res.status).toBe(403);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("confirms an existing upload without treating it as a new allocation", async () => {
  const id = "00000000-0000-4000-8000-000000000001",
    mediaId = "00000000-0000-4000-8000-000000000002";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id, sealed: false, deleted: false }],
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [
          { id: mediaId, key: "private-key", size: 5, uploaded: false },
        ],
      }),
    });
  const where = vi.fn().mockResolvedValue([]),
    set = vi.fn().mockReturnValue({ where });
  mocks.db.mockReturnValue({ select, update: () => ({ set }) });
  const { storage } = await import("../lib/storage");
  vi.spyOn(storage, "head").mockResolvedValue({
    ContentLength: 5,
    $metadata: {},
  });
  const res = await POST(
    new Request(`https://diary.example/api/entries/${id}/media/${mediaId}`, {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    ctx(["entries", id, "media", mediaId]),
  );
  expect(res.status).toBe(200);
  expect(set).toHaveBeenCalledWith({ uploaded: true });
});
it("refuses to seal when an ordered chunk is missing", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const update = vi.fn();
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id, sealed: false, deleted: false }],
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { sequence: 0, uploaded: true },
            { sequence: 2, uploaded: true },
          ],
        }),
      }),
    });
  mocks.db.mockReturnValue({ select, update });
  const res = await POST(
    new Request(`https://diary.example/api/entries/${id}/seal`, {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: '{"count":2}',
    }),
    ctx(["entries", id, "seal"]),
  );
  expect(res.status).toBe(409);
  expect(update).not.toHaveBeenCalled();
});
it("retains a tombstone while signed upload links can still recreate media", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({ where: async () => [{ id, deleted: false }] }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [
          { key: "private-key", uploadExpiresAt: new Date(Date.now() + 60000) },
        ],
      }),
    });
  const remove = vi.fn();
  mocks.db.mockReturnValue({
    select,
    update: () => ({ set: () => ({ where: async () => [] }) }),
    delete: remove,
  });
  const { storage } = await import("../lib/storage");
  vi.spyOn(storage, "remove").mockResolvedValue({ $metadata: {} });
  const res = await DELETE(
    new Request(`https://diary.example/api/entries/${id}`, {
      method: "DELETE",
      headers: { origin: "https://diary.example" },
    }),
    ctx(["entries", id]),
  );
  expect(await res.json()).toEqual({ ok: true, pendingCleanup: true });
  expect(remove).not.toHaveBeenCalled();
});

it("prevents an old device from recreating a deleted recording", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const insert = vi.fn();
  mocks.db.mockReturnValue({
    select: () => ({
      from: () => ({
        where: async () => [{ id, deleted: true, purged: true }],
      }),
    }),
    insert,
  });
  const res = await POST(
    new Request("https://diary.example/api/entries", {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    }),
    ctx(["entries"]),
  );
  expect(res.status).toBe(410);
  expect(insert).not.toHaveBeenCalled();
});
it("acknowledges a completed audio chunk after the entry has been sealed", async () => {
  const id = "00000000-0000-4000-8000-000000000001",
    mediaId = "00000000-0000-4000-8000-000000000002";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id, sealed: true, deleted: false }],
      }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: async () => [
          {
            id: mediaId,
            uploaded: true,
            sequence: 0,
            size: 5,
            mime: "audio/webm",
          },
        ],
      }),
    });
  mocks.db.mockReturnValue({ select });
  const res = await POST(
    new Request(`https://diary.example/api/entries/${id}/media`, {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: mediaId,
        kind: "audio",
        sequence: 0,
        size: 5,
        mime: "audio/webm",
      }),
    }),
    ctx(["entries", id, "media"]),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ uploaded: true, url: null });
});

it.each(["photo", "audio"] as const)(
  "creates a %s entry with appropriate processing state",
  async (kind) => {
    mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    const values = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    mocks.db.mockReturnValue({
      select: () => ({ from: () => ({ where: async () => [] }) }),
      insert: () => ({ values }),
    });
    const id = "00000000-0000-4000-8000-000000000001";
    const response = await POST(
      new Request("https://diary.example/api/entries", {
        method: "POST",
        headers: {
          origin: "https://diary.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...(kind === "photo"
            ? { kind, title: "A day", body: "My photos" }
            : {}),
        }),
      }),
      ctx(["entries"]),
    );
    expect(response.status).toBe(200);
    expect(values).toHaveBeenLastCalledWith(
      expect.objectContaining(
        kind === "photo"
          ? {
              id,
              kind,
              title: "A day",
              body: "My photos",
              sealed: true,
              transcription: "complete",
              writing: "complete",
            }
          : { id, kind: "audio" },
      ),
    );
    if (kind === "audio")
      expect(values.mock.calls[1][0]).not.toHaveProperty("sealed");
  },
);
it("does not claim an audio transcription lease for a photo entry", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const update = vi.fn();
  mocks.db.mockReturnValue({
    select: () => ({
      from: () => ({ where: async () => [{ kind: "photo", deleted: false }] }),
    }),
    update,
  });
  const id = "00000000-0000-4000-8000-000000000001";
  const response = await POST(
    new Request(`https://diary.example/api/entries/${id}/transcription`, {
      method: "POST",
      headers: { origin: "https://diary.example" },
      body: "{}",
    }),
    ctx(["entries", id, "transcription"]),
  );
  expect(response.status).toBe(409);
  expect(update).not.toHaveBeenCalled();
});
it("keeps a photo entry pending until all expected images are uploaded", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({ where: async () => [{ kind: "photo", deleted: false }] }),
    })
    .mockReturnValueOnce({
      from: () => ({ where: async () => [{ kind: "photo", uploaded: false }] }),
    });
  const update = vi.fn();
  mocks.db.mockReturnValue({ select, update });
  const id = "00000000-0000-4000-8000-000000000001";
  const response = await POST(
    new Request(`https://diary.example/api/entries/${id}/photos-complete`, {
      method: "POST",
      headers: { origin: "https://diary.example" },
      body: JSON.stringify({ count: 1 }),
    }),
    ctx(["entries", id, "photos-complete"]),
  );
  expect(response.status).toBe(409);
  expect(update).not.toHaveBeenCalled();
});

it("saves typed entries as complete without audio processing", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const values = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: async () => [] });
  mocks.db.mockReturnValue({
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values }),
  });
  const res = await POST(
    new Request("https://diary.example/api/entries", {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, kind: "text", body: "My own words." }),
    }),
    ctx(["entries"]),
  );
  expect(res.status).toBe(200);
  expect(values).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id,
      kind: "text",
      body: "My own words.",
      upload: "complete",
      transcription: "complete",
      writing: "complete",
      sealed: true,
    }),
  );
});
it("rejects empty typed entries before writing to the database", async () => {
  mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
  const insert = vi.fn();
  mocks.db.mockReturnValue({ insert });
  const res = await POST(
    new Request("https://diary.example/api/entries", {
      method: "POST",
      headers: {
        origin: "https://diary.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "00000000-0000-4000-8000-000000000001",
        kind: "text",
        body: "   ",
      }),
    }),
    ctx(["entries"]),
  );
  expect(res.status).toBe(400);
  expect(insert).not.toHaveBeenCalled();
});
it.each(["seal", "transcription", "transcript", "generate"])(
  "refuses %s for typed entries",
  async (action) => {
    const id = "00000000-0000-4000-8000-000000000001";
    mocks.auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    mocks.db.mockReturnValue({
      select: () => ({
        from: () => ({
          where: async () => [{ id, kind: "text", deleted: false }],
        }),
      }),
    });
    const res = await POST(
      new Request(`https://diary.example/api/entries/${id}/${action}`, {
        method: "POST",
        headers: { origin: "https://diary.example" },
        body: "{}",
      }),
      ctx(["entries", id, action]),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This entry does not need audio processing",
    });
  },
);

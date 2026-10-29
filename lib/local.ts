import { openDB } from "idb";
export type LocalSession = {
  id: string;
  createdAt: string;
  stopped: boolean;
  count: number;
  kind?: "audio" | "photo";
  title?: string;
  body?: string;
};
export type LocalChunk = {
  id: string;
  entryId: string;
  sequence: number;
  kind: "audio" | "photo";
  blob: Blob;
  uploaded: boolean;
};
const database = () =>
  openDB("diary-recordings", 1, {
    upgrade(db) {
      db.createObjectStore("sessions", { keyPath: "id" });
      const chunks = db.createObjectStore("chunks", { keyPath: "id" });
      chunks.createIndex("entryId", "entryId");
    },
  });
export const local = {
  sessions: async () =>
    (await database()).getAll("sessions") as Promise<LocalSession[]>,
  session: async (s: LocalSession) => (await database()).put("sessions", s),
  chunks: async (id: string) =>
    (await database()).getAllFromIndex("chunks", "entryId", id) as Promise<
      LocalChunk[]
    >,
  chunk: async (c: LocalChunk) => (await database()).put("chunks", c),
  remove: async (id: string) => {
    const db = await database();
    const chunks = await db.getAllFromIndex("chunks", "entryId", id);
    const tx = db.transaction(["chunks", "sessions"], "readwrite");
    for (const c of chunks) await tx.objectStore("chunks").delete(c.id);
    await tx.objectStore("sessions").delete(id);
    await tx.done;
  },
};

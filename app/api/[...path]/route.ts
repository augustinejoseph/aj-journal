import { auth } from "@/auth";
import { allowed } from "@/lib/access";
import { db } from "@/lib/db";
import { entries, media, settings, users } from "@/lib/schema";
import { and, eq, asc, desc, sql } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { storageDateKey } from "@/lib/dates";
import { generate } from "@/lib/ai";
import { z } from "zod";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const maxDuration = 60;
const uuid = z.string().uuid();
const edit = z.object({
  title: z.string().max(200),
  body: z.string().max(200000),
  tags: z.array(z.string().max(60)).max(30),
});
async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const session = await auth();
    if (!allowed(session?.user?.email, process.env.ALLOWED_EMAIL))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (
      req.method !== "GET" &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const p = (await params).path;
    const database = db();
    const method = req.method;
    if (p[0] === "settings") {
      if (method === "GET") {
        const [s] = await database.select().from(settings);
        return Response.json({
          model:
            s?.model || process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
        });
      }
      if (method === "PUT") {
        const { model } = z
          .object({ model: z.string().min(1).max(160) })
          .parse(await req.json());
        await database
          .insert(settings)
          .values({ id: 1, model })
          .onConflictDoUpdate({ target: settings.id, set: { model } });
        return Response.json({ ok: true });
      }
    }
    if (p[0] !== "entries")
      return Response.json({ error: "Not found" }, { status: 404 });
    if (p.length === 1) {
      if (method === "GET") {
        return Response.json(
          await database
            .select()
            .from(entries)
            .where(sql`(${entries.deleted}=false or ${entries.purged}=false)`)
            .orderBy(desc(entries.createdAt)),
        );
      }
      if (method === "POST") {
        const { id, createdAt, kind, title, body } = z
          .object({
            id: uuid,
            createdAt: z.iso.datetime().optional(),
            kind: z.enum(["audio", "photo"]).default("audio"),
            title: z.string().max(200).optional(),
            body: z.string().max(200000).optional(),
          })
          .parse(await req.json());
        const [existing] = await database
          .select()
          .from(entries)
          .where(eq(entries.id, id));
        if (existing?.deleted)
          return Response.json(
            { error: "This recording was deleted. Remove its local copy." },
            { status: 410 },
          );
        const email = session!.user!.email!.trim().toLowerCase();
        const userId = createHash("sha256").update(email).digest("hex");
        await database
          .insert(users)
          .values({
            id: userId,
            email,
            name: session?.user?.name ?? null,
            image: session?.user?.image ?? null,
          })
          .onConflictDoNothing();
        await database
          .insert(entries)
          .values({
            id,
            userId,
            kind,
            ...(kind === "photo"
              ? {
                  title: title?.trim() || "Photos from today",
                  body: body || "",
                  transcription: "complete",
                  writing: "complete",
                  sealed: true,
                }
              : {}),
            ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
          })
          .onConflictDoNothing();
        return Response.json({ id });
      }
    }
    const id = uuid.parse(p[1]);
    const [entry] = await database
      .select()
      .from(entries)
      .where(eq(entries.id, id));
    if (!entry || (entry.deleted && method !== "DELETE"))
      return Response.json({ error: "Entry not found" }, { status: 404 });
    const where = eq(entries.id, id);
    if (p.length === 2) {
      if (method === "GET")
        return Response.json({
          ...entry,
          media: await database
            .select()
            .from(media)
            .where(eq(media.entryId, id))
            .orderBy(asc(media.sequence)),
        });
      if (method === "PATCH") {
        const data = edit.parse(await req.json());
        await database
          .update(entries)
          .set({
            ...data,
            lease: null,
            leaseUntil: null,
            writing: data.body.trim()
              ? "complete"
              : entry.writing === "processing"
                ? "pending"
                : entry.writing,
          })
          .where(and(where, eq(entries.deleted, false)));
        return Response.json({ ok: true });
      }
      if (method === "DELETE") {
        // Tombstone first: never let a concurrent writer revive deleted entries.
        await database.update(entries).set({ deleted: true }).where(where);
        const files = await database
          .select()
          .from(media)
          .where(eq(media.entryId, id));
        for (const file of files) await storage.remove(file.key);
        const awaitingExpiry = files.some(
          (f) => f.uploadExpiresAt && f.uploadExpiresAt.getTime() > Date.now(),
        );
        if (!awaitingExpiry) {
          await database.delete(media).where(eq(media.entryId, id));
          await database
            .update(entries)
            .set({
              purged: true,
              title: "",
              body: "",
              transcript: "",
              tags: [],
              error: null,
              lease: null,
              leaseUntil: null,
              transcriptionLease: null,
              transcriptionLeaseUntil: null,
            })
            .where(where);
        }
        return Response.json({ ok: true, pendingCleanup: awaitingExpiry });
      }
    }
    if (p[2] === "media") {
      if (method === "POST" && p.length === 3) {
        const data = z
          .object({
            id: uuid,
            kind: z.enum(["audio", "photo"]),
            sequence: z.number().int().min(0),
            mime: z.string().max(100),
            size: z.number().int().positive().max(25000000),
          })
          .parse(await req.json());
        if (
          !(
            data.kind === "audio"
              ? /^audio\/(webm|mp4|ogg|wav)(;.*)?$/
              : /^image\/(jpeg|png|webp|heic|heif)$/
          ).test(data.mime)
        )
          throw new Error("Unsupported media type");
        if (entry.kind === "photo" && data.kind === "audio")
          throw new Error("Photo entries cannot contain audio");
        if (entry.sealed && data.kind === "audio") {
          const [saved] = await database
            .select()
            .from(media)
            .where(and(eq(media.entryId, id), eq(media.id, data.id)));
          if (
            saved?.uploaded &&
            saved.sequence === data.sequence &&
            saved.size === data.size &&
            saved.mime === data.mime
          )
            return Response.json({ uploaded: true, url: null });
          throw new Error("Recording already finished");
        }
        if (data.kind === "audio" || entry.kind === "photo")
          await database
            .update(entries)
            .set({ upload: "processing", error: null })
            .where(where);
        const userId = createHash("sha256")
          .update(session!.user!.email!.trim().toLowerCase())
          .digest("hex");
        const key = `users/${userId}/${storageDateKey(entry.createdAt)}/${id}/${data.kind}/${data.id}`;
        await database
          .insert(media)
          .values({ ...data, entryId: id, key })
          .onConflictDoNothing();
        const [file] = await database
          .select()
          .from(media)
          .where(
            and(
              eq(media.entryId, id),
              eq(media.kind, data.kind),
              eq(media.sequence, data.sequence),
            ),
          );
        if (
          file.id !== data.id ||
          file.size !== data.size ||
          file.mime !== data.mime
        )
          throw new Error("Chunk identity conflict");
        if (!file.uploaded)
          await database
            .update(media)
            .set({ uploadExpiresAt: new Date(Date.now() + 180000) })
            .where(eq(media.id, file.id));
        return Response.json({
          url: file.uploaded ? null : await storage.upload(file.key, file.mime),
          uploaded: file.uploaded,
        });
      }
      const mediaId = uuid.parse(p[3]);
      const [file] = await database
        .select()
        .from(media)
        .where(and(eq(media.id, mediaId), eq(media.entryId, id)));
      if (!file)
        return Response.json({ error: "Media not found" }, { status: 404 });
      if (method === "GET") {
        if (!file.uploaded) throw new Error("Media upload incomplete");
        return Response.json({ url: await storage.read(file.key) });
      }
      if (method === "POST") {
        const head = await storage.head(file.key);
        if (head.ContentLength !== file.size)
          throw new Error("Upload size mismatch");
        await database
          .update(media)
          .set({ uploaded: true })
          .where(eq(media.id, file.id));
        return Response.json({ ok: true });
      }
    }
    if (p[2] === "upload-failure" && method === "POST") {
      const { error } = z
        .object({ error: z.string().max(500) })
        .parse(await req.json());
      await database
        .update(entries)
        .set({ upload: "failed", error })
        .where(
          and(where, sql`(${entries.sealed}=false or ${entries.kind}='photo')`),
        );
      return Response.json({ ok: true });
    }
    if (p[2] === "photos-complete" && method === "POST") {
      const { count } = z
        .object({ count: z.number().int().positive() })
        .parse(await req.json());
      const photos = await database
        .select()
        .from(media)
        .where(and(eq(media.entryId, id), eq(media.kind, "photo")));
      if (photos.length !== count || photos.some((photo) => !photo.uploaded))
        throw new Error(
          "Some photos still need uploading. Retry from this device.",
        );
      if (entry.kind === "photo")
        await database
          .update(entries)
          .set({ upload: "complete", error: null })
          .where(where);
      return Response.json({ ok: true });
    }
    if (
      entry.kind === "photo" &&
      ["seal", "transcription", "transcript", "generate"].includes(p[2])
    )
      throw new Error("Photo entries do not need audio processing");
    if (p[2] === "seal" && method === "POST") {
      const { count } = z
        .object({ count: z.number().int().positive() })
        .parse(await req.json());
      const chunks = await database
        .select()
        .from(media)
        .where(and(eq(media.entryId, id), eq(media.kind, "audio")))
        .orderBy(asc(media.sequence));
      if (
        chunks.length !== count ||
        chunks.some((c, i) => !c.uploaded || c.sequence !== i)
      )
        throw new Error(
          "Some audio is still only saved locally. Retry uploads.",
        );
      await database
        .update(entries)
        .set({ sealed: true, upload: "complete" })
        .where(where);
      return Response.json({ ok: true });
    }
    if (p[2] === "transcription") {
      if (method === "POST") {
        const token = crypto.randomUUID();
        const claimed = await database
          .update(entries)
          .set({
            transcription: "processing",
            transcriptionLease: token,
            transcriptionLeaseUntil: new Date(Date.now() + 180000),
            error: null,
          })
          .where(
            and(
              where,
              eq(entries.deleted, false),
              eq(entries.sealed, true),
              sql`${entries.transcription}<>'complete'`,
              sql`(${entries.transcriptionLeaseUntil} is null or ${entries.transcriptionLeaseUntil}<now())`,
            ),
          )
          .returning();
        return Response.json({ token: claimed.length ? token : null });
      }
      if (method === "PUT") {
        const { token } = z.object({ token: uuid }).parse(await req.json());
        await database
          .update(entries)
          .set({ transcriptionLeaseUntil: new Date(Date.now() + 180000) })
          .where(
            and(
              where,
              eq(entries.transcriptionLease, token),
              eq(entries.deleted, false),
            ),
          );
        return Response.json({ ok: true });
      }
    }
    if (p[2] === "transcript" && method === "POST") {
      const { transcript, token } = z
        .object({ transcript: z.string().min(1).max(500000), token: uuid })
        .parse(await req.json());
      if (!entry.sealed) throw new Error("Finish uploading audio first");
      const saved = await database
        .update(entries)
        .set({
          transcript,
          transcription: "complete",
          transcriptionLease: null,
          transcriptionLeaseUntil: null,
          error: null,
        })
        .where(
          and(
            where,
            eq(entries.transcriptionLease, token),
            eq(entries.deleted, false),
          ),
        )
        .returning();
      if (!saved.length)
        throw new Error("Transcription lease expired. Retry to recover.");
      return Response.json({ ok: true });
    }
    if (p[2] === "failure" && method === "POST") {
      const { error, token } = z
        .object({ error: z.string().max(500), token: uuid })
        .parse(await req.json());
      await database
        .update(entries)
        .set({
          transcription: "failed",
          transcriptionLease: null,
          transcriptionLeaseUntil: null,
          error,
        })
        .where(and(where, eq(entries.transcriptionLease, token)));
      return Response.json({ ok: true });
    }
    if (p[2] === "generate" && method === "POST") {
      if (!entry.transcript) throw new Error("Transcript required");
      const { force = false } = z
        .object({ force: z.boolean().optional() })
        .parse(await req.json());
      const token = crypto.randomUUID();
      const claimed = await database
        .update(entries)
        .set({
          lease: token,
          leaseUntil: new Date(Date.now() + 90000),
          writing: "processing",
          error: null,
        })
        .where(
          and(
            where,
            eq(entries.deleted, false),
            sql`(${entries.leaseUntil} is null or ${entries.leaseUntil}<now())`,
            force ? sql`true` : sql`${entries.writing}<>'complete'`,
          ),
        )
        .returning();
      if (!claimed.length) return Response.json({ ok: true, busy: true });
      try {
        const [s] = await database.select().from(settings);
        const result = await generate(
          entry.transcript,
          s?.model || process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
          {
            entryId: id,
            modelSource: s?.model
              ? "database"
              : process.env.OPENROUTER_MODEL
                ? "environment"
                : "default",
          },
        );
        await database
          .update(entries)
          .set({
            ...result,
            writing: "complete",
            lease: null,
            leaseUntil: null,
          })
          .where(
            and(where, eq(entries.lease, token), eq(entries.deleted, false)),
          );
      } catch (error) {
        await database
          .update(entries)
          .set({
            writing: "failed",
            error: error instanceof Error ? error.message : "Writing failed",
            lease: null,
            leaseUntil: null,
          })
          .where(and(where, eq(entries.lease, token)));
        throw error;
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: error instanceof z.ZodError ? 400 : 409 },
    );
  }
}
async function privateResponse(
  req: Request,
  context: Parameters<typeof handle>[1],
) {
  const response = await handle(req, context);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = privateResponse;
export const POST = privateResponse;
export const PATCH = privateResponse;
export const PUT = privateResponse;
export const DELETE = privateResponse;

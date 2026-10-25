import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  googleId: text().unique(),
  name: text(),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const entries = pgTable("entries", {
  id: uuid().primaryKey(),
  userId: text().references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  title: text().notNull().default("Untitled recording"),
  body: text().notNull().default(""),
  transcript: text().notNull().default(""),
  tags: jsonb().$type<string[]>().notNull().default([]),
  upload: text().notNull().default("pending"),
  transcription: text().notNull().default("pending"),
  writing: text().notNull().default("pending"),
  transcriptionLease: uuid(),
  transcriptionLeaseUntil: timestamp({ withTimezone: true }),
  error: text(),
  sealed: boolean().notNull().default(false),
  deleted: boolean().notNull().default(false),
  purged: boolean().notNull().default(false),
  lease: uuid(),
  leaseUntil: timestamp({ withTimezone: true }),
});
export const media = pgTable(
  "media",
  {
    id: uuid().primaryKey(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    sequence: integer().notNull(),
    key: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    uploaded: boolean().notNull().default(false),
    uploadExpiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("media_order").on(t.entryId, t.kind, t.sequence)],
);
export const settings = pgTable("settings", {
  id: integer().primaryKey(),
  model: text().notNull(),
});
export type Entry = typeof entries.$inferSelect;
export type Media = typeof media.$inferSelect;

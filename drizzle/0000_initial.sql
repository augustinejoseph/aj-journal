CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text DEFAULT 'Untitled recording' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upload" text DEFAULT 'pending' NOT NULL,
	"transcription" text DEFAULT 'pending' NOT NULL,
	"writing" text DEFAULT 'pending' NOT NULL,
	"transcriptionLease" uuid,
	"transcriptionLeaseUntil" timestamp with time zone,
	"error" text,
	"sealed" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"purged" boolean DEFAULT false NOT NULL,
	"lease" uuid,
	"leaseUntil" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entryId" uuid NOT NULL,
	"kind" text NOT NULL,
	"sequence" integer NOT NULL,
	"key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded" boolean DEFAULT false NOT NULL,
	"uploadExpiresAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_entryId_entries_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_order" ON "media" USING btree ("entryId","kind","sequence");
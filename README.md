# Still — voice-first private diary

Configuration now uses `.env`: copy `.env.sample` and fill in the JSON string values inside its single `APP_CONFIG` entry. The app, Drizzle migrations, and R2 CORS script load this file. Restart the app after editing it. The previous flat configuration is backed up as `.env.legacy` and is no longer loaded automatically.

For hosting, set one environment variable named `APP_CONFIG` to the JSON object text (without the `APP_CONFIG=` prefix or the surrounding single quotes). Hosted `APP_CONFIG` takes precedence over the local file. These values remain server-side; never put secrets in `next.config`'s `env` option or `NEXT_PUBLIC_` variables.

Next.js App Router, TypeScript, Tailwind, shadcn-style Radix button, Auth.js Google, Drizzle/Neon, private R2 and server-side OpenRouter. Built for one configured owner. No demo authentication bypass, scheduled jobs, paid transcription API, photo analysis, export or history UI.

## Project documentation

See [agent-artifacts](agent-artifacts/README.md) for structured stack, workflow, deployment, development, and current-status documentation.

## Run

Use Node 22+ (Node 24 recommended).

1. `npm ci`
2. Fill the ignored `.env` using `.env.sample`. Never commit real secrets.
3. `npm run db:migrate`
4. `npm run dev`

Create `AUTH_SECRET` with `openssl rand -base64 32`. Set `ALLOWED_EMAIL` to your exact Google email. Google OAuth callback: `http://localhost:3000/api/auth/callback/google`; production: `<production-origin>/api/auth/callback/google`. Configure Google consent/test-user access as applicable. Use a Neon PostgreSQL connection string and a private R2 bucket with bucket-scoped object read/write credentials. Disable R2 public access.

R2 CORS must allow your exact production and development origins, methods `PUT`, `GET`, `HEAD`, headers `Content-Type`, and expose `ETag`. The CORS generator always allows `http://localhost:3000` and adds the origin from `PRODUCTION_URL` in `.env`. Uploading this file to the repository does not configure the live bucket. In Cloudflare, open R2 → the journal bucket → Settings → CORS policy and save the policy there. An OPTIONS 403 means the browser preflight was rejected; check that its Origin and requested method/headers match the live policy. Bucket CORS administration requires credentials with bucket configuration permissions; the app’s object access credentials may return AccessDenied. Regenerate `r2-cors.json` with `npm run --silent r2:cors > r2-cors.json`, then apply that file to R2. No public bucket URL is used. Media access is checked by Auth.js before issuing bearer URLs that expire in 180 seconds. A URL already issued remains usable until expiry.

## Deploy on Vercel

Import this folder as a Next.js project. Add every `.env.sample` variable as an encrypted deployment variable, set `AUTH_URL=<production-origin>`, apply migrations to the target Neon database, then deploy and attach your configured production domain in Vercel Domains. Apply the DNS record Vercel supplies at your DNS provider. The API declares a 60-second maximum duration; choose hosting settings supporting this duration. Writing calls time out at 45 seconds. No credentials or deployment access were supplied, so provisioning and domain attachment are not performed by this source project.

## Modules and flow

- `lib/storage.ts`: replaceable S3-compatible private media adapter.
- `lib/ai.ts`: replaceable writer, faithful translation prompt and validated structured output. The API key stays server-side. The private Settings screen sets the model ID.
- `worker/transcribe.ts` and `lib/transcription.ts`: local Whisper Small q8, WebGPU initialization with WASM fallback, browser model cache, mono 16 kHz input and overlapping inference windows. Transcription uses the original language; English translation is the writer's job. Model download/run remains on-device; models are fetched from Hugging Face.
- `lib/local.ts`: IndexedDB sessions and ordered Blob chunks. `lib/processing.ts`: resumable uploads and processing coordinator.
- `lib/schema.ts` and `drizzle/`: schema and committed migrations.
- `app/api/[...path]/route.ts`: authenticated JSON interfaces. `POST entries` is idempotent by UUID. Chunk allocation is unique by entry/kind/sequence; confirmation checks object size. Sealing verifies all ordered audio chunks exist before processing. `GET entries` is also pending-work retrieval; independent statuses live on each entry.

A recording immediately creates a local session, persists chunks every ten seconds, and continuously uploads. Each recording is a distinct entry. Stop seals the uploaded recording. Stopping automatically runs local transcription followed by server-side writing. Open Processing queue and choose Retry all to resume incomplete work. Keep the tab open. Retry is serialized across tabs with Web Locks when available; chunk identities, conditional transcript writes, and database writing leases protect other concurrent clients. Expired writing leases can be retried after 90 seconds. Transcription uses separate three-minute leases, renewed every 30 seconds while the tab is active. Completed work is skipped. Regenerate explicitly replaces generated text/tags; the source transcript remains untouched. Failed AI requests preserve existing text and transcript.

Interrupted sessions show Recover on the recording device. This finalizes the chunks already persisted; the last unsaved recorder buffer can be lost. For another device, Finish saved audio finalizes only complete cloud chunks after explicit confirmation. Local-only audio requires the original browser profile. Unfinished photo uploads are picked up by Retry all. Photos are saved locally before upload and are never sent to AI.

Delete tombstones the entry before removing media, blocking later reads and writer updates. If recently issued PUT URLs have not expired, the hidden tombstone remains visible in Processing queue for cleanup: run Retry all after three minutes to delete any late uploads and remove media metadata. A scrubbed UUID tombstone is retained to prevent stale devices from recreating deleted entries. Deletion failures remain retryable. There is deliberately no background cleanup scheduler.

## Practical limits and release gates

There is no application recording timer. Browser suspension, storage quota, battery and memory remain real limits. Persistent storage is requested but browsers can refuse or evict it. Ten-second chunks are persisted before uploading; data not yet emitted by MediaRecorder cannot be recovered. Individual uploads are limited to 25 MB; normal audio chunks are much smaller. All audio chunks are joined in order for playback and decoding; exceptionally long recordings can exceed device decoding memory. These failures retain cloud audio for a desktop retry. Model initialization falls back to WASM; runtime memory failures are recoverable, rather than silently switching to a paid service.

Whisper Small accuracy for code-switched Malayalam/English and mobile performance are **not validated for release**. The whole recording must fit in browser decoding memory even though inference uses 30-second windows. Test representative owner-supplied recordings before real use. Browser recording codecs and interrupted MP4 files need physical-device testing. No sample recordings or live provider credentials were supplied.

Search and date/tag filtering run privately in the authenticated browser over loaded entries. Calendar days and date filters use local time. Photos are only loaded on demand using private links. Local original chunks remain until entry deletion, including after cloud upload; use browser storage settings carefully.

## Validation

`npm run lint`, `npm test`, `npm run typecheck`, `npm run build`. Lint uses Next.js/TypeScript rules and fails on warnings; `npm run lint:fix` applies automatic fixes. Tests cover owner policy, unauthenticated routes, cross-origin writes, AI output/error handling, repeated chunk upload, incomplete uploads, sealing order and skipping completed processing. See `VALIDATION.md` for external-integration and device acceptance checks. These automated checks do not substitute for live Google, Neon, R2, OpenRouter or physical-device testing.

The migration history is consolidated into `drizzle/0000_initial.sql` for a fresh database. Do not apply this rewritten baseline over a database that already used the previous migration history. Local `.env` has a generated auth secret; `.env.sample` intentionally leaves secrets and external credentials blank. `PRODUCTION_URL` is a deployment/CORS helper; on Vercel set `AUTH_URL` to the production origin.

The application directory defaults to `https://apps.ajoseph.dev/apps.json`. To use another deployed launcher, set `NEXT_PUBLIC_AJ_REGISTRY_URL` to its HTTPS `/apps.json` URL in the hosting environment before building Journal, then redeploy. This public setting is compiled into the client bundle; keep it separate from the server-only `APP_CONFIG`. The launcher must be deployed and its hostname must resolve for the directory to load.

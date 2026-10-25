# Deployment runbook

## Target

- Platform: Vercel, Next.js application.
- Production origin: `PRODUCTION_URL` in ignored `.env`; use that origin as `AUTH_URL` on Vercel.
- Database: Neon PostgreSQL.
- Object storage: private Cloudflare R2 bucket.
- Identity: Google OAuth restricted to the configured verified email.
- Writer: OpenRouter, with model ID configurable privately.

Deployment is not verified by the source repository alone. Check [status](STATUS.md) for outstanding external validation.

## Environment variables

Use `.env.sample` as the variable-name template. Put local values in ignored `.env`; add production values through Vercel environment settings. Do not copy secrets into documentation, logs, screenshots, or Git.

| Variable               | Purpose                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`          | Session/authentication secret; generate with `openssl rand -base64 32`                         |
| `PRODUCTION_URL`       | Optional production origin used by the CORS generator; set production `AUTH_URL` to this value |
| `AUTH_URL`             | Local or production application origin                                                         |
| `AUTH_GOOGLE_ID`       | Google OAuth client ID                                                                         |
| `AUTH_GOOGLE_SECRET`   | Google OAuth client secret                                                                     |
| `ALLOWED_EMAIL`        | Exact owner Google email                                                                       |
| `DATABASE_URL`         | Target Neon PostgreSQL connection string                                                       |
| `R2_ACCOUNT_ID`        | Cloudflare account ID                                                                          |
| `R2_ACCESS_KEY_ID`     | Bucket-scoped object access key                                                                |
| `R2_SECRET_ACCESS_KEY` | Matching object access secret                                                                  |
| `R2_BUCKET`            | Private bucket name                                                                            |
| `OPENROUTER_API_KEY`   | Server-side writing key                                                                        |
| `OPENROUTER_MODEL`     | Initial model ID; saved private setting takes precedence                                       |

## Provision services

1. Create the Neon database and set its connection string.
2. Create a private R2 bucket and bucket-scoped read/write credentials. Disable public access.
3. The tracked `r2-cors.json` is localhost-only. Set `AUTH_URL` and optional `PRODUCTION_URL` in `.env`, run `npm run --silent r2:cors > /tmp/diary-r2-cors.json`, and apply the generated JSON to R2. Permit GET, HEAD, PUT and Content-Type; expose ETag.
4. Create Google OAuth credentials and configure consent/test-user access as needed.
5. Register callbacks:
   - Local: `http://localhost:3000/api/auth/callback/google`.
   - Production: `<production-origin>/api/auth/callback/google`.
6. Configure OpenRouter credentials and an available model supporting the requested structured JSON response.

## Validate and deploy

1. Use Node 24 and run `npm ci`.
2. Configure `.env` against the intended database.
3. Run `npm run lint`, `npm test`, `npm run typecheck`, and `npm run build`.
4. Review committed SQL migrations; run `npm run db:migrate` against the target database. Migrations are not automatically executed by the build.
5. Import the repository/folder into Vercel as a Next.js project. Configure every required secret for the intended environment.
6. Set production `AUTH_URL=<production-origin>`. The API requests a 60-second maximum duration; hosting must support it.
7. Deploy, attach your configured production domain in Vercel Domains, and apply the DNS record supplied by Vercel.
8. Complete `VALIDATION.md`: owner login, other-account denial, private media, upload/recovery, AI failure handling, deletion, and physical-device transcription checks.

## Updates and recovery

- Review schema changes and apply migrations deliberately before deploying code that requires them.
- Use Vercel deployment rollback for application regressions; do not assume it rolls back database migrations or media changes.
- Rotate credentials through provider and Vercel settings if needed; never store old credentials in artifacts.
- After media deletion with outstanding upload URLs, keep/reopen the app and Retry all after three minutes to finish cleanup.
- Treat configured services, DNS, successful authentication, and actual device recordings as separate release checks; a build does not verify them.

## Initial migration baseline

`drizzle/0000_initial.sql` creates the complete schema in one migration, with a matching initial snapshot and journal. It is intended for a fresh database; no database was reset or migrated by this consolidation. Existing databases using the former migration history must not run this rewritten baseline directly.

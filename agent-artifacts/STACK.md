# Stack

## Application

| Layer             | Technology                                                          | Source / responsibility                                          |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runtime           | Node.js 22.12+; Node 24 recommended                                 | `package.json` engines                                           |
| Framework         | Next.js 16 App Router, React 19, TypeScript                         | `app/`; server-rendered authentication boundary and client diary |
| Styling           | Tailwind CSS 4 and custom paper-themed CSS                          | `app/globals.css`, `postcss.config.mjs`                          |
| UI primitives     | Radix Slot, class-variance-authority, shadcn-style local components | `components/ui/button.tsx`, `components.json`                    |
| Icons             | Lucide React                                                        | `components/`                                                    |
| Authentication    | Auth.js 5 beta, Google OAuth, JWT sessions                          | `auth.ts`, `lib/access.ts`                                       |
| Database          | Neon PostgreSQL, Drizzle ORM / Kit                                  | `lib/db.ts`, `lib/schema.ts`, `drizzle/`                         |
| Private media     | Cloudflare R2 through AWS S3 SDK                                    | `lib/storage.ts`                                                 |
| Local persistence | IndexedDB through `idb`                                             | `lib/local.ts`                                                   |
| Transcription     | Transformers.js 4, quantized multilingual Whisper Small             | `worker/transcribe.ts`, `lib/transcription.ts`                   |
| English writing   | OpenRouter chat completions, Zod output validation                  | `lib/ai.ts`                                                      |
| Hosting target    | Vercel                                                              | Next.js deployment; production origin configured in `.env`       |
| Quality checks    | ESLint, Next.js rules, TypeScript, Vitest, Prettier                 | Root configs, `tests/`, package scripts                          |

Exact installed versions are recorded in `package-lock.json`; use `npm ci` for reproducible installation.

## Replacement boundaries

- Replace R2/S3 implementation behind `lib/storage.ts`; retain private upload, read, HEAD, and delete operations.
- Replace the writing provider in `lib/ai.ts`; keep validated `{ title, body, tags }` output and faithful translation semantics.
- Replace local speech recognition in `worker/transcribe.ts` and `lib/transcription.ts`; preserve worker progress / completion / error messages and source transcripts.
- Change database wiring in `lib/db.ts`; schema changes belong in `lib/schema.ts` and generated migrations.
- Change owner policy in `lib/access.ts` and `auth.ts`; every diary API route must continue authorizing requests.
- Keep local storage in `lib/local.ts` and orchestration in `lib/processing.ts`, independently of presentation components.

## Boundaries

One owner; one entry per recording; English generated text; original-language transcripts. Photos are attachments only. No scheduled processing, paid transcription API, export, or version-history UI. Hosting, database, storage, and OpenRouter can incur usage charges.

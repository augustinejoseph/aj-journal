# Development and maintenance

## Commands

| Command                    | Use                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `npm ci`                   | Install exact locked dependencies                                                        |
| `npm run dev`              | Start local development                                                                  |
| `npm run lint`             | Check code using ESLint; warnings fail the command                                       |
| `npm run lint:fix`         | Apply safe ESLint fixes; remaining findings still fail                                   |
| `npm run format`           | Format the configured application/source paths with Prettier                             |
| `npm test`                 | Run Vitest regression tests                                                              |
| `npm run typecheck`        | Check TypeScript without emitting code                                                   |
| `npm run build`            | Produce a production Next.js build using webpack                                         |
| `npm run start`            | Serve the production build                                                               |
| `npm run --silent r2:cors` | Print CORS JSON from environment origins; redirect outside the repository for deployment |
| `npm run db:generate`      | Generate migrations from schema changes                                                  |
| `npm run db:migrate`       | Apply committed migrations to the configured database                                    |

Use Node 22.12+; Node 24 is recommended. Configure `.env` from `.env.sample` before exercising live services.

## Code map

- `app/page.tsx`: authenticated entry point and Google login.
- `app/api/auth/[...nextauth]/route.ts`: Auth.js handlers.
- `app/api/[...path]/route.ts`: authenticated diary, processing, settings, and media API.
- `components/diary.tsx`: diary views, recording lifecycle, editing and queue controls.
- `components/calendar.tsx`, `components/entry-card.tsx`: reusable journal presentation.
- `components/ui/`: local UI primitives.
- `lib/`: database, storage, access, AI, local persistence, API client, processing and transcription adapters.
- `worker/transcribe.ts`: local speech recognition worker.
- `drizzle/`: committed migrations and schema snapshots.
- `tests/`: owner/access, route, AI and processing regressions.

## Lint policy

`eslint.config.mjs` uses Next.js Core Web Vitals and TypeScript recommendations. Generated Next.js output, generated environment types, dependency files, and Drizzle snapshots are ignored. Fix findings in source; use narrow, explained exceptions only where application behavior requires one. Do not disable whole rule groups to obtain a passing result.

Formatting, linting, type checking, tests, and production builds answer different questions. Run checks appropriate to each change. Integration and physical-device coverage remains documented in `VALIDATION.md`.

## Handoff maintenance

Update `STATUS.md` with commands actually run and the observed results. Update stack/workflow/deployment documents when their behavior changes. Preserve owner-only access, source transcripts, stable chunk identities, processing leases, and deletion tombstones when replacing modules. Do not commit `.env`, private samples, or model downloads.

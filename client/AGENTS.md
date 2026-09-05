<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TICO client

Read `../AGENTS.md` first. This file covers what is specific to `client/`, and the rule
below about generated files is the one that has already cost this team a week.

## Never hand-write the AI contract

`src/lib/ai/types.ts` is **generated**. The header says so. Do not edit it, and do not
add types to it by hand.

```bash
cd ../ai-backend && python scripts/gen_client_types.py
```

**This is not a style preference.** `types.ts` was hand-written once. It drifted from the
Python DTOs, nothing failed, and the drift only surfaced when a real request came back
`422` on five fields at once — after both sides had built weeks of work on incompatible
assumptions. Generated types cannot drift, because the service that owns the contract
emits them.

If a type you need is missing, the fix is in `ai-backend/app/schemas/`, not here.

### The three artifacts that decide what is true

| Question | The answer is in | Not in |
| --- | --- | --- |
| What tables and columns exist? | `prisma/schema.prisma` | any prose document |
| What does the AI service accept and return? | its `/openapi.json` (→ `types.ts`) | `types.ts` read on its own |
| *Why* is it shaped that way? | `../docs/06-data-model-and-contracts.md` | — |

`docs/06` explains the invariants and is binding for the HTTP envelope. It is **not**
binding for entity names: it still describes `World`, `MissionSession`, `CodeSubmission`
and eight other tables that do not exist. Believe `schema.prisma`.

## Talking to the AI service

Go through `src/lib/ai/client.ts`. Never call the service with a bare `fetch` from a
route handler or a component — the wrapper is where four contract requirements live:

- **`X-Request-ID` on every request.** docs/06 requires it. The Python service echoes it
  into its logs and into every error body, which is what makes a bug report from a
  classroom traceable instead of a guess.
- **Unwrapping `{ data, meta }`.** Every success body is enveloped. `fetchAi<T>` returns
  the `data` half, so callers get the payload type directly.
- **`AiServiceError`.** Failures carry `code`, `requestId` and `retryable` from the
  documented error shape. Retry only when `retryable` is true.
- **A 15s timeout.** These calls sit inside a student's interaction loop.

The one exception is `POST /v1/tico/messages`, which streams SSE and is never enveloped.
`streamTicoMessage` returns the raw `Response` for that reason.

### Always have a fallback

The AI service going down must never block a student. `hint.service.ts` is the pattern:
try the service, and on any failure fall back to the authored `exercise.hints` array and
carry on. A mission must stay completable with the AI service switched off entirely.

## Naming: mission vs exercise

The database table is `exercises`. Everything a student can see calls it a **mission**,
and so does the AI contract (`missionId`). Both are correct in their own layer; when you
cross the boundary, translate — `missionId: exercise.id` — rather than renaming either
side.

Same pattern: a `Track` row is a **world** (Cairo Metro, Cairo Traffic).

## Prisma

- `prisma/schema.prisma` is the single source of truth for every table, AI tables
  included. The Python service reads and writes them with SQLAlchemy but never migrates
  them.
- After changing it: `pnpm db:generate`, then create a migration in the same commit. A
  schema change without a migration is the other half of how this project got out of
  sync — a teammate added 13 models and no migration, so the schema and the database
  said different things with nothing to flag it.
- **Never run `prisma migrate reset` against a shared database.** It drops everything.

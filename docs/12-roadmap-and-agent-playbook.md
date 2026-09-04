# Roadmap and agent playbook

## Delivery principle

Build vertical slices that a learner can actually use. Contracts and deterministic rules come before AI polish. Each slice includes Arabic/English, young/undergraduate variants, accessibility, telemetry, tests, and fallback behavior.

## Milestones

### M0 — foundations

- Keep monorepo boundaries and service instructions current.
- Establish design tokens, locale routing, typed translations, and responsive shell.
- Integrate Supabase email/password + Google authentication; create the mapped app profile.
- Expand the Prisma schema and migrations around world → lesson → mission/version → session/submission/progress plus the eight AI capability tables.
- Define Pydantic DTOs and OpenAPI fixtures before implementing AI services.
- Add CI for client, Python, contracts, manifests, and docs.

**Exit:** a verified user can sign in, switch locale/mode, view seeded roadmap data, and sign out; contract fixtures pass in both languages.

### M1 — first playable bakery slice

- Implement CodeMirror editor and pinned Pyodide worker.
- Seed bakery world and mission 1 with reviewed temporary assets.
- Implement run/submit, transactional first completion, 100 XP, and replay.
- Implement static four-rung hints and the success scene.

**Exit:** mission 1 is completable keyboard-only on desktop and landscape tablet, survives reload, fails safely offline, and duplicates no rewards.

### M2 — bakery chapter

- Deliver bakery missions 1–6, manifests, assets, both modes/locales.
- Add deterministic mastery, mission sessions, and hint-event storage.
- Add error-category endpoint and cached generated hints for eligible age bands.
- Complete under-13 route-denial tests.

**Exit:** learners complete the core variables → conditionals → loops → functions sequence, with static fallback under AI outage.

### M3 — station and adaptive plan

- Deliver station missions 7–12 and world transitions.
- Add diagnostic, required/optional lesson plan, replayable skips, and progress visualization.
- Implement composer scaffolding/repetition/advance rules plus conflict review.

**Exit:** two learners with different diagnostics receive different membership/scaffolding without reordered concepts.

### M4 — traffic and generation studio

- Deliver traffic missions 13–18 and challenge arena foundation.
- Implement constrained mission generation, validators, retry twice, template fallback, staff review, immutable publication.
- Import and review the complete asset set.

**Exit:** all 18 missions ship; a generated mission cannot bypass schema, manifest, executable, localization, safety, or human-review gates.

### M5 — pilot hardening

- Complete accessibility audit, security test, Arabic educator review, privacy/legal gates, data deletion, restore drill, cost/load tests, runbooks, and teacher support materials.
- Run a small supervised pilot and revise thresholds from evidence.

**Exit:** release checklist is signed by engineering, curriculum, design, safeguarding/privacy, and product owners.

## Parallel work lanes

After M0 contracts are merged, agents may work in these bounded lanes:

| Lane | Owns | Must not change alone |
| --- | --- | --- |
| Client shell | routes, components, localization, styling | shared DTO semantics, auth policy |
| Runner | editor, worker, harness, browser tests | progression truth, AI execution |
| Game data | all Prisma models/migrations in `public`, seed, transactions | Python runtime mappings without a synced contract |
| AI contracts | Pydantic schemas, OpenAPI, fixtures | client contract without synced fixture |
| AI domain | mastery, planning, composer, hint ladder | concept order or mastery via model |
| AI model | prompts, router, guards, evals | unvalidated publication, inline model IDs |
| Content/assets | manifests, mission content, asset metadata | new IDs outside reviewed manifest process |

Only the designated migration owner changes `client/prisma/schema.prisma` or creates Prisma migrations. The AI service has no Alembic history and never changes database structure.

## Agent start checklist

1. Read root `AGENTS.md`, then the nearest nested `AGENTS.md`.
2. Read this roadmap and the documents for the chosen lane.
3. Inspect current code, migrations, and tests; never assume a scaffold is empty.
4. State the vertical slice and acceptance criteria in the task/PR.
5. Modify the smallest owning service. Communicate through documented HTTP/contracts.
6. Preserve user work and unrelated dirty files.
7. Add or update tests, translations, telemetry, environment examples, and docs in the same change.
8. Run the service's required checks and report exact results and remaining risk.

## Definition of done

A change is done only when behavior is implemented end-to-end; input is validated; authentication/authorization is enforced; loading/empty/error/fallback states exist; Arabic/English and RTL/LTR rules pass; keyboard and accessible names work; deterministic and integration tests cover the risk; telemetry is redacted; schema/contract changes are versioned; `.env.example` is updated for new configuration; and no secret or unrelated change is committed.

AI-specific changes also require Pydantic structured output, router-only model selection, interaction logging, deterministic validation, answer-leak testing where relevant, and fallback behavior.

## Suggested first issues

1. Locale-aware visual shell and translated landing page.
2. Supabase auth server/client utilities and protected `/learn` route.
3. Shared public-schema v2 design and Prisma migration for game and AI capability tables.
4. Shared contract examples plus FastAPI Pydantic scaffold.
5. World YAML schema and bakery manifest.
6. Browser runner protocol and worker initialization spike.
7. Seeded bakery mission 1 vertical slice.

## Authoritative references

When implementation details may have changed, use installed framework docs first and official vendor docs second:

- Next.js 16: `client/node_modules/next/dist/docs/`
- [Supabase Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Prisma with Supabase](https://supabase.com/docs/guides/database/prisma)
- [Pyodide Web Worker usage](https://pyodide.org/en/stable/usage/webworker.html)
- [FastAPI documentation](https://fastapi.tiangolo.com/)
- [Google Gemini API documentation](https://ai.google.dev/gemini-api/docs)

Do not copy version-sensitive code from these planning documents when installed or current official documentation differs.

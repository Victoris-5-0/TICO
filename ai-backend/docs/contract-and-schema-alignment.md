# Contract and schema alignment

**Branch:** `fix/contract-and-schema-alignment`
**Date:** 5 September 2026
**Status:** applied and verified against a live Supabase project (PostgreSQL 17.6)

This is the change that makes the client and the AI backend agree. Everything here is on
one branch so the team can read it before any of it lands.

Nothing in it is destructive. The three migrations create 29 tables and drop nothing, and
every existing model in `schema.prisma` is untouched except for back-relations, which
Prisma requires on both sides and which emit no SQL.

---

## 1. Why this was necessary

The client and the AI backend had been building against two different contracts for weeks
without a single failure to warn either side. Proof, from a live dev instance — this is
the exact body `client/src/services/hint.service.ts` sends:

```
POST /v1/hints
{ "sessionId", "missionId", "codeExcerpt", "lastResult", "locale" }

HTTP 422
  session_id     Field required
  code           Field required
  sessionId      Extra inputs are not permitted
  missionId      Extra inputs are not permitted
  codeExcerpt    Extra inputs are not permitted
  lastResult     Extra inputs are not permitted
  locale         Extra inputs are not permitted
```

Every field wrong, in both directions, on the first endpoint either side would integrate.

Alongside it, the database was in a third state again: `schema.prisma` on `main` carried
20 models, and `client/prisma/migrations/` carried a migration for **7**. Thirteen models
had been added with no migration, so the schema file and any database built from the
migrations described different things — and nothing checked.

## 2. Root cause

Not carelessness. Three structural problems, each of which made the drift invisible.

### 2.1 The authority document is half stale

`docs/06-data-model-and-contracts.md` is designated by the root `AGENTS.md` (line 29) as
the cross-service contract authority. It is *correct and binding* for the HTTP layer, and
the client implemented it faithfully — the `{data, meta}` envelope, the error object,
`X-Request-ID`, and the endpoint table's "mission/session IDs, code excerpt, last result,
locale", which is verbatim what `types.ts` contained.

It is also *authoritative and wrong* about the data model. Of the fourteen entities it
names, **three exist**:

| docs/06 says | Reality |
| --- | --- |
| `World` | `Track` |
| `Mission` | `Exercise` |
| `MissionSession` | `PracticeSession` |
| `CodeSubmission` | `Submission` |
| `LevelConcept` | `ExerciseConcept` |
| `CompanionThread` | `CompanionChat` |
| `MissionVersion`, `Message`, `Asset`, `MissionAsset`, `ContentReview` | never built |
| `User`, `UserProgress`, `Concept` | correct |

A reader cannot tell which half to trust. The client trusted the HTTP half and was right.
The AI backend treated the whole document as aspirational and wrote its own DTOs — and
was wrong, but had no way to discover it.

### 2.2 The rules were asymmetric

Root `AGENTS.md` made reading `ai-backend/AGENTS.md` **mandatory** before touching any
shared contract. There was no matching rule in the other direction, and
`client/AGENTS.md` was **nine lines of auto-generated Next.js boilerplate** with nothing
about contracts at all.

So the contract was defended on one side and completely open on the other. Meanwhile
`ai-backend/AGENTS.md` declared "Ahmed owns `schemas/` … they are the contract" — a
statement that contradicts docs/06, sitting in a file no client-side agent ever reads.

### 2.3 Nothing was executable

Both definitions were prose or hand-written code. `types.ts` was hand-written and could
drift silently; `schema.prisma` could gain models with no migration; the Pydantic DTOs
could diverge from docs/06. **Every one of these failures is mechanically detectable, and
none of them was being detected.**

---

## 3. What changed

### 3.1 Database — three migrations, 29 tables, nothing dropped

The migration history was missing everything after the original seven tables. I recovered
the schema as of the init migration from git (`df5020a`) and verified it reproduces the
committed SQL exactly, which made it safe to generate the gaps without a shadow database.

| Migration | Adds | Destructive |
| --- | --- | --- |
| `20260902000000_init` *(existing)* | 7 tables, 3 enums | 0 |
| `20260904000000_game_and_ai_telemetry` **new** | 13 tables, 8 enums | 0 |
| `20260905000000_adaptive_spine` **new** | 9 tables, 3 enums | 0 |

`_game_and_ai_telemetry` is **your teammate's work**, unchanged — it is the migration that
should have accompanied the 13 models on `feat/build-backend`. I only generated the SQL
for models that already existed. `_adaptive_spine` is the new work.

Verified: applying all three to an empty database reproduces `schema.prisma` exactly —
94 statements from the schema, 94 from the migration chain, identical sets.

#### The nine new models

The adaptive design has no axis to measure a student along without these. No mastery, no
scaffolding, no skipping, no generation.

- **`Concept`** — variables → conditionals → loops → functions. `sequenceOrder` *is* the
  roadmap. No prerequisite graph: a linear order is a sort column, not a DAG.
- **`ExerciseConcept`** — the most load-bearing join in the schema. Learning is
  cumulative, so a loops exercise still uses variables. One `isPrimary` concept per
  exercise plus weighted carried ones, which is how early concepts stay alive without a
  single extra exercise.
- **`ConceptMastery`** — per student, per concept. Computed in Python from attempts,
  hints and time. Never produced by a model.
- **`StudentProfile`** — the cached rollup every prompt loads. Recomputed after a session
  closes, never in the request path.
- **`LessonPlan`** — the student's personal path through the fixed order. `reason` and
  `decidedBy` make every skip auditable, and a skipped lesson stays replayable.
- **`MissionTemplate`** / **`GeneratedMission`** — authored bounds projected from
  `content/worlds/*.yaml`, and the composed scenarios. `validated` is set by a Python
  validator, never by the model approving its own output.
- **`ErrorTag`** — the open half of error classification. Starts empty and fills itself.
- **`HintCache`** — the primary cost lever. Gemini's context caching has minimum-token
  thresholds that short hint prompts never reach, so this is not an optimisation.

### 3.2 The wire contract

**camelCase on the wire, snake_case in Python.** Declared once, on the `Schema` base class
in `app/schemas/common.py`, via a Pydantic alias generator. Not per-field, and no Python
attribute was renamed. `populate_by_name` keeps snake_case input working, so internal
callers are unaffected.

**The `{data, meta}` envelope**, implemented in `app/core/envelope.py` as middleware. Every
success body is wrapped; every error becomes
`{error: {code, message, request_id, retryable, details}}`; every response carries
`X-Request-ID`, echoed if the client supplied one.

> The client's `fetchAi` already unwrapped with `data.data || data`, so this cost them
> nothing.

It is middleware rather than `response_model=Envelope[T]` on eleven routes for a specific
reason: `fetchAi<T>` returns the **inner** model, so `openapi.json` must describe the
inner model for the generated TypeScript to be correct. Wrapping at the transport layer
keeps the schema describing exactly what the client receives. SSE is never wrapped.

**Endpoints the client called that did not exist.** Four:

| Called | Was | Now |
| --- | --- | --- |
| `/v1/missions/generate` | 404 | implemented (stub) |
| `/v1/sessions/{id}/debrief` | 404 | implemented (stub) |
| `/health` | 404 — it is `/v1/health` | client fixed |
| `/v1/mentor/messages` | 404 — dead since TICO became the single mascot | client method deleted |

**A silent data loss.** `/v1/students/{id}/refresh` accepted no request body, so the
`{watermark}` the client sent was discarded by FastAPI without error. docs/06 specifies
that watermark, and it is what makes the call idempotent — without it, firing refresh
twice after one session counts the same attempts into mastery twice. Now accepted.

**Every shared enum was the wrong case.** Prisma emits Postgres enum labels in
UPPERCASE. All seven shared enums were lowercase in Pydantic:

| Enum | Was | Now |
| --- | --- | --- |
| `ErrorFamily` | `"logic"` | `"LOGIC"` |
| `Phase` | `"guided_coding"` | `"GUIDED_CODING"` |
| `SessionOutcome` | `"in_progress"` | `"IN_PROGRESS"` |
| `ScaffoldLevel` | `"partial"` | `"PARTIAL"` |
| `LessonRequirement` | `"required"` | `"REQUIRED"` |
| `DecidedBy` | `"rule"` | `"RULE"` |
| `SkillBand` | `"on_level"` | `"ON_LEVEL"` |

This one is worse than the field names, because it would not have failed validation — it
would have failed at **runtime on a database write**, as a 500 in a classroom. Somebody
had already hit it: `submission.service.ts` carried a `.toUpperCase()` and a hand-written
whitelist of the seven valid families to bridge the gap. Both are now deleted; the same
token flows through Python, JSON, TypeScript and Postgres unchanged.

**`/submissions/analyze` disagreed with the database.** `schema.prisma` calls the columns
`errorFamily`, `errorTag` and `attemptNumber`, and the client's TypeScript matched it.
The Pydantic DTO was the only place calling them `family` and `tag`, and it had no
`attemptNumber` at all — so which attempt an error happened on, which is real evidence,
was not reaching the classifier. Renamed and added.

**Mission inputs docs/06 specified were missing.** `NextMissionRequest` accepted only
`forceRegenerate`, but docs/06 endpoint 5 lists "learner profile, lesson, world manifest
version" and the client was passing `lessonId` and `worldManifestVersion`. Both added,
plus `worldSlug` on the challenge request. The *learner* half stays absent on purpose —
see below.

**A security hole the typecheck surfaced.** Three client call sites were passing
`profileId: user.id` into the request body. docs/06 is explicit: *"The server derives
`student_id`, role, allowed lesson, hint rung, and legal manifest choices. Clients cannot
choose them."* A client that can name the student can ask for another child's next
mission. The DTOs never accepted the field, so the calls would have failed anyway — but
they are now removed at the source.

**Field-level changes** on `POST /v1/hints`, the one endpoint both sides had built:

| Before (Python) | Now (wire) |
| --- | --- |
| `session_id` | `sessionId` |
| `code` | `codeExcerpt` |
| — | `missionId` *(required; keys the hint cache)* |
| — | `lastResult` *(`PASSED`/`FAILED`/`ERROR`/`TIMEOUT`)* |
| — | `locale` |
| `error_text`, `error_tag` | `errorText`, `errorTag` *(optional, kept)* |
| response `text` | response `hint` |

`hint.service.ts` needed **no change** — it already sent exactly this and read
`aiResponse.hint`.

### 3.3 `types.ts` is now generated

```bash
cd ai-backend && python scripts/gen_client_types.py           # write
python scripts/gen_client_types.py --check                    # CI
```

38 types emitted from `/openapi.json`. No npm dependency: the service that owns the
contract emits the types, so regeneration cannot drift from it.

Eleven type names changed to the generated ones (`AnalyzeSubmissionRequest` →
`AnalyzeRequest`, `CreateSessionRequest` → `SessionCreate`, and so on). Two hand-written
response types were guesses and are now the real thing — `NextMissionResponse` was three
fields, `GeneratedMissionOut` is the full mission.

`client.ts` was rewritten around this: it sends `X-Request-ID`, unwraps the envelope, and
throws `AiServiceError` carrying `code`, `requestId` and `retryable` instead of a bare
status number.

### 3.4 The JWKS URL was wrong (found by applying it for real)

`settings.jwks_url` built `<SUPABASE_URL>/auth/v1/jwks`. That path 404s. The real one is
the RFC 8615 well-known path, `/auth/v1/.well-known/jwks.json`.

The failure mode is nasty: a failed JWKS fetch falls through to the HS256 branch, and
with no `JWT_SECRET` set every authenticated request returns 401 with nothing in the logs
saying why. It would have looked like a token problem, or a client problem, for as long
as anyone cared to look.

`test_auth.py` asserted the wrong URL too, so the test and the code were wrong together
and neither could catch the other. Both fixed, and verified against the live project:

```
alg=ES256  kty=EC  kid=351b2417-…
```

So the project is in **asymmetric mode** and `JWT_SECRET` correctly stays empty. Worth
noting the diagnostic that settled it, because it is not obvious: `/auth/v1/jwks` and
`/auth/v1/.well-known/jwks.json` both require an `apikey` header, and the first returns a
plain-text `404 page not found` that looks exactly like "this project has no signing
keys."

### 3.5 The rules that let it happen

- **`client/AGENTS.md`** — was 9 lines of Next.js boilerplate. Now states that `types.ts`
  is generated, which three artifacts are authoritative, that docs/06 is half stale, the
  mission/exercise naming boundary, and the requirement that a schema change ships with
  its migration.
- **Root `AGENTS.md`** — added the reciprocal mandatory-reading rule for `client/`, and a
  table naming the three executable authorities. Corrected the "use snake_case columns"
  rule, which the seven original camelCase tables have always violated.
- **`ai-backend/AGENTS.md`** — the "schemas/ *are* the contract" claim is now scoped:
  they are the contract for this service, bound by docs/06, and docs/06 wins on the wire.
  Added how to read docs/06's two halves, and the camelCase rule.
- **`docs/06`** — a status header at the top marking exactly which sections are binding
  and which are stale, with the entity-name mapping.

### 3.6 Tests: 68 → 84

`tests/test_contract.py` is new and is the point of the whole exercise. Every check in it
is a failure that would otherwise surface in demo week:

- every path `client.ts` calls exists — parsed out of their source, so a 404 becomes a red
  build now
- the client's exact hint body is accepted verbatim
- no snake_case reaches the public schema
- the envelope, the error shape, request-id echo, and that SSE stays unwrapped
- errors never leak a traceback
- **`types.ts` is not stale** — regenerate-and-compare, so forgetting to regenerate fails

The 14 existing tests that broke on the envelope were updated through one `data()` helper
in `conftest.py` that unwraps exactly as the client does — so if the envelope ever
regresses, the tests break the same way the client would.

---

## 4. What this does to the team's work

**The backend teammate:** nothing of theirs was deleted or rewritten — no field, attribute
or relation was removed from any of the 20 models. Six of them gained back-relation lines
only, because Prisma requires a relation to be declared on both sides:

| Model | Lines added |
| --- | --- |
| `User` | `conceptMastery`, `studentProfile`, `lessonPlans`, `generatedMissions` |
| `Track` | `missionTemplates` |
| `Lesson` | `lessonPlans` |
| `Exercise` | `concepts` |
| `PracticeSession` | `generatedMission` (their existing `generatedMissionId` finally has a target) |
| `HintEvent` | `concept` (same — their `conceptId` was a dangling column) |

Those last two are worth pointing out: they had already written `generatedMissionId` and
`conceptId` as plain columns pointing at tables that did not exist yet. Those are now real
foreign keys.

Their 13 models got the migration they were missing, generated from their own schema.
They should review `20260904000000_game_and_ai_telemetry` and confirm it is what they
intended.

**The client team:** `types.ts` and `client.ts` changed. `hint.service.ts` did not, and
neither did any component. The eleven renamed types are the only thing that could touch
other files — a typecheck will list them all in one pass.

**`pnpm typecheck` passes clean.** It found 8 errors on the first run, every one a real
contract break rather than a churn artefact — the enum casing, the `family`/`tag` rename,
the missing `attemptNumber`, the three `profileId` leaks, and a whole Next.js route
proxying `/v1/mentor/messages`, an endpoint that never existed server-side. All fixed.
`src/app/api/v1/ai/mentor/` is deleted; `tico/messages` was already there and is the real
one.

That first run is the argument for this whole branch in miniature: eight breakages, none
of which any tool had been in a position to report before.

**The database:** not applied. See below.

---

## 5. To apply this

The database is empty, so this is a clean build with nothing to preserve.

```bash
cd client
pnpm db:deploy      # applies all three migrations in order
pnpm db:generate
```

> `pnpm db:deploy`, not `db:migrate` — and **never `prisma migrate reset`** against the
> shared database. It drops everything.

Then, from `ai-backend`:

```bash
python -m pytest tests -q                    # 84 passing
python scripts/gen_client_types.py --check   # types in sync
```

**This has been applied and verified.** Against a fresh Supabase project (ref
`rkopujievemxjzspteyk`, PostgreSQL 17.6, eu-west-1), from an empty database:

| Check | Result |
| --- | --- |
| `prisma migrate deploy` | all 3 applied |
| `prisma migrate status` | "Database schema is up to date" |
| `migrate diff` schema vs live DB | "No difference detected" — zero drift |
| Tables created | 29 (+ `_prisma_migrations`) |
| Enum types created | 14 |
| Foreign keys | 40 |
| SQLAlchemy models | every mapped `SELECT` runs against the live schema |
| `GET /v1/health` | `{"status":"ok","database":"ok"}` |
| Mixed casing intact | `exercises.starterCode` and `concepts.sequence_order` both present |

---

## 6. Still open

- **SQLAlchemy models for the 22 new tables.** `app/models_tables/` covers the original 7.
  `test_model_mapping.py` checks models against migrations, so nothing is broken by the
  gap — but the AI services cannot read the new tables until the models exist. This is the
  next piece of work.
- **`docs/06`'s entity table** should be rewritten against the real schema rather than
  only carrying a warning header. That is a decision for whoever owns the doc.
- **`Idempotency-Key`** is specified by docs/06 for retryable commands and is not yet
  implemented on either side. `RefreshRequest.watermark` gives `/refresh` idempotency
  already; `/sessions` and `/submissions/analyze` still need it.

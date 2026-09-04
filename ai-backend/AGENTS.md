# AGENTS.md — `tico-ai`

Python AI backend for **TICO / Code Egypt** (SONIC team, VICTORIS 5.0).
FastAPI + LangChain/LangGraph over Supabase Postgres.

Structure, tooling and deployment follow **Sanjeev Thiyagarajan's FastAPI course**
(`github.com/Sanjeev-Thiyagarajan/fastapi-course`), extended with an `ai/` layer.
Where this repo departs from the course, it says so below — don't "fix" it back.

## What this service is

- **One** FastAPI app with **six** AI capability modules. Not nine deployables.
- Next.js on Vercel owns the UI, the game engine and code execution. This service returns
  **JSON decisions only** — it never renders game state and never executes student code.
- It owns the `ai` Postgres schema inside the team's shared Supabase project. Nothing else.

## The learning model — read this before designing anything

1. **The concept order is fixed and linear.** variables → conditionals → loops → functions.
   The system never reorders concepts and there is no prerequisite graph.
2. **But which lessons a student needs is not fixed.** After the diagnostic each lesson is
   marked `required` or `optional` in `student_lesson_plan`. The order never changes; the
   membership does. A skipped lesson stays replayable — skipping is a suggestion, never a
   lock-out, and `level.is_skippable` marks lessons that may never be optional.
3. **Learning is cumulative.** Every lesson has one **target concept** and several
   **carried concepts** already taught. Recorded in `level_concept(is_primary, weight)`.
   A result moves the target's mastery at full weight and each carried concept at its own.
4. **Worlds are chapters** spanning several lessons (Cairo Metro → Cairo Traffic → …).
   The world never changes mid-lesson.
5. **Adaptation happens inside a lesson**, with exactly three levers: how much of the
   carried concepts is pre-scaffolded, how many reps before advancing, and advance-or-hold
   at the concept gate. A rule sets all three — see "rules propose" below.
6. **Missions are generated at runtime** from a world manifest — see below.
7. **After the roadmap** comes the challenge arena: mastered concepts mixed, no scaffolding.

## The six services

| Service | Module | Model? |
|---|---|---|
| **TICO** — hints, chat, in-world reactions (one character, one persona) | `ai/chains/tico_hint.py`, `ai/graphs/tico_chat.py` | yes, cached |
| **Code analysis** — classify a failure into a fixed enum | `ai/chains/classify_error.py` | yes, small |
| **Student model** — weighted mastery over target + carried | `services/student_model.py`, `domain/mastery.py` | summary only |
| **Path planner** — required/optional lessons from the diagnostic | `services/planner.py`, `domain/plan.py` | reviews every skip |
| **Adaptive composer** — scaffold plan, difficulty, reps, advance/hold | `domain/composer.py` | reviews conflicts only |
| **Mission generation** — compose a scenario from the world inventory | `ai/graphs/mission_gen.py` | yes, validated |

### Rules propose, the model reviews

The planner and the composer decide things *about* a student. Both follow one pattern: a
pure-Python rule in `domain/` produces a decision **and a confidence**; when the evidence
conflicts, a model reviews the full profile and confirms or overrides with a written reason.
Clear-cut cases never reach a model. Always log `decided_by` and `reason` so any decision can
be explained. **Mastery numbers are the exception — always Python, never a model.**

TICO is the mascot **and** the hint-giver **and** every in-world voice. Do not add a second
character service.

## World manifests

`content/worlds/*.yaml` lists everything a mission in that world may use: scenes,
characters, props, mechanics, constraints. **If it is not in the manifest, the AI may not
put it in a mission.** Generation is selection from a closed set, never invention.

The `verbs` and `reads` on each prop are the real code API the student writes against. A
Python validator re-reads the manifest after generation and rejects any mission that
references an id or verb that does not exist, or whose solution fails its own tests.

## Setup

```bash
python -m venv venv && source venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
pytest
```

## Stack — do not substitute

| Concern | Choice |
|---|---|
| Framework | FastAPI + Uvicorn (Gunicorn w/ uvicorn workers in prod) |
| ORM | SQLAlchemy, **synchronous** — as in the course |
| Driver | `psycopg2-binary` |
| Migrations | Alembic, scoped to `ai` |
| Validation | Pydantic **v2** (see deviations) |
| Config | `app/config.py`, Pydantic `BaseSettings` — never read `os.environ` elsewhere |
| Auth | Verify Supabase JWT (see deviations) |
| Tests | pytest |
| Container | Docker + `docker-compose-dev.yml` / `docker-compose-prod.yml` |
| CI/CD | GitHub Actions |
| Prod host | AWS EC2 Ubuntu — Nginx → Gunicorn under systemd |

### Three deliberate deviations from the course

1. **Pydantic v2, not v1.** The course pins `pydantic==1.8.2`; LangChain and LangGraph
   require v2. The one thing that cannot be copied.
2. **We verify JWTs, we don't issue them.** Supabase Auth owns login. `app/core/auth.py`
   verifies the token and extracts `user_id`. No user/password table here.
3. **No Heroku.** Free tier is gone and the architecture diagram says AWS — so the course's
   *Ubuntu VM* recipe runs on EC2. Same `gunicorn.service`, same `nginx/` config.

Sync SQLAlchemy is a feature: the asyncpg prepared-statement problem with Supabase's
pgbouncer pooler does not apply. Connect through the session pooler.

## Layout

```
app/
  main.py
  config.py            Pydantic BaseSettings — the only place env vars are read
  database.py          engine, SessionLocal, get_db
  api/v1/              routers ONLY — HTTP in, HTTP out, no logic
  schemas/             Pydantic DTOs — the public contract
  domain/              pure, zero I/O: mastery.py, plan.py, composer.py, hint_ladder.py
  services/            use-cases: orchestrate domain + repositories + graphs
  ai/
    graphs/            LangGraph — tico_chat, mission_gen
    chains/            single-shot runnables — tico_hint, classify_error
    prompts/           versioned templates
    router.py          capability -> model mapping, read from config
    guards.py          output validation, answer-leak check, manifest validator
  repositories/        SQLAlchemy queries, one module per aggregate
  models/              ORM for the `ai` schema + read-only views of game tables
  core/                deps, Supabase JWT auth, logging, error handling
content/worlds/        the world manifests
alembic/               scoped to the `ai` schema
nginx/                 prod reverse-proxy config
tests/ evals/
```

## The dependency rule

`api → services → domain / repositories / ai`

Routers never import SQLAlchemy. `domain/` never imports LangChain. Mastery, the plan rules
and the composer all live in `domain/`, so every decision rule in the system is testable with
no database and no API key.

## Hard rules

- **Never create or alter a table outside the `ai` schema.** Alembic is configured with
  `version_table_schema="ai"` and an `include_object` filter. Breaking this drops the game
  developer's data.
- **Every model call goes through `app/ai/router.py`** and returns a Pydantic model. No
  inline model IDs anywhere else.
- **Prompts live in `app/ai/prompts/`.** Bump the version string when you change one.
- **Log every model call** to `ai.ai_interaction` — capability, model, tokens, cost, latency.
- **The server narrows, the model chooses.** Code produces a closed set of legal options;
  the model only picks among them or writes prose. Never an unbounded space.
- **Mastery numbers are computed in Python**, never produced by a model.
- **A generated mission is never shown unvalidated.** Validator rejects twice → fall back to
  the template defaults.
- **No complete solution before the final hint rung.** Asserted in tests, not trusted.
- **Never commit the Supabase service-role key.** It bypasses RLS — re-check ownership per
  request from the verified JWT.
- Pass `locale` explicitly: TICO speaks Egyptian Arabic, code identifiers stay English.

## Endpoints — build in this order

| # | Endpoint | Service |
|---|---|---|
| 1 | `POST /v1/hints` | TICO — hint mode |
| 2 | `POST /v1/submissions/analyze` | Code analysis |
| 3 | `POST /v1/students/{id}/refresh` | Student model (background) |
| 4 | `POST /v1/students/{id}/plan` | Path planner — after the diagnostic |
| 5 | `POST /v1/missions/next` | Composer + generation (the full pipeline) |
| 6 | `POST /v1/tico/messages` | TICO — chat mode, SSE |
| 7 | `POST /v1/challenges/next` | Challenge arena |

## Database

Eight tables in `ai`: `concept_mastery`, `student_lesson_plan`, `mission_session`,
`hint_event`, `ai_interaction`, `mission_template`, `generated_mission`, `student_profile`.
Build `ai_interaction` first —
it is the cost dashboard, bug log, eval set and safety audit trail.

Game tables need: `level_concept(is_primary, weight)` ← **the critical one**,
`concept(sequence_order)`, `code_submission(session_id, attempt_number, phase,
hints_used_before, error_category)`, `level(difficulty_score, world_id, is_skippable)`,
`campaign(environment_key)`, `user(locale, grade_or_age_band)`.

**No `concept_prerequisite`** — the concept order is a sort column, not a graph.
Per-student variation lives in `student_lesson_plan` instead.

## Ownership

- **Ahmed owns Alembic.** Nobody else runs `alembic revision` — not the game developer,
  not the AI teammate. One person, one migration history.
- **Ahmed owns `schemas/`.** He writes the Pydantic DTOs; the AI teammate builds against
  whatever they say. Write them first, before either lane starts — they are the contract.
- **AI teammate owns `domain/` and `ai/`** — hint ladder, mastery, plan, composer, chains,
  graphs, prompts, guards, evals. All testable with no DB and no API key.

## Settled

- **Language: Python.** Student code is Python, so manifest `verbs` are Python
  (`gate.open()`, `station.passengers -> int`), starter code is Python, and hint prose uses
  Python terms.
- Vocabulary is **world → lesson → mission** (`campaign` → `level` → `generated_mission`).

## The hint ladder — 4 rungs

The server counts prior `hint_event` rows and fixes the rung in `domain/hint_ladder.py`
before any model is called. The model writes prose for **that rung only**.

| Rung | Job | May contain |
|---|---|---|
| 1 | Orient — point at the region, no diagnosis | nothing from the solution |
| 2 | Question — make them think about the concept | nothing from the solution |
| 3 | Name the concept, show the pattern on a *different* example | the concept, a foreign example |
| 4 | Walk to the fix in their own code, in words | the precise change, never a runnable line |

**No rung ever emits a complete solution.** After rung 4 the student goes to a
**mini-practice** on that one idea, then returns to the mission. This matches the team's own
UX flow and makes "TICO never hands over the answer" literally true.

Leak test, graded by rung: rungs 1–2 contain no solution identifier; rung 3 contains none of
the student's target values; rung 4 contains no complete runnable line.

## Model provider — Google Gemini

`langchain-google-genai` / `ChatGoogleGenerativeAI`, key in `GOOGLE_API_KEY`, read through
`config.py`. The map lives in `ai/router.py`, read from settings.

| Route | Model | Why |
|---|---|---|
| TICO hints, NPC lines, reactions | `gemini-3.5-flash-lite` | high volume, short output, latency-sensitive |
| Error classification | `gemini-3.5-flash-lite` | small structured output; escalate on low confidence |
| Escalation review (planner skip, composer conflict) | `gemini-3.5-flash` | judgement over a messy profile |
| Mission generation | `gemini-3.5-flash` | structured composition, validated in Python after |
| TICO chat | `gemini-3.5-flash` | conversational, streams |

- **Pin stable IDs. No `-preview` models** — `gemini-3-pro-preview` has already been shut down.
- **Do not use `gemini-2.5-*`** — retiring 20 Oct 2026.
- `with_structured_output()` takes Pydantic models directly, which is what `guards.py` wants.
- **Prompt caching will not save you here.** Gemini context caching targets large contexts and
  has minimum-token thresholds; TICO prompts are short. **The Postgres hint cache is the
  primary cost lever** — required, not an optimisation.
- Check the rate limit on whatever tier the key is on. A per-minute cap that trips mid-demo
  looks identical to a broken service.

## Open decisions

None blocking — every build decision is settled.

---
Design settled 2026-09-04 (six services, escalation pattern). Full detail in `docs/ai-architecture.html`, `docs/use-cases.html`
and `docs/roadmap.html`. Keep this file under ~160 lines; it is read by agents on every task.

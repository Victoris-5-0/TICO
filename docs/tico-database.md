# TICO — Database Schema

Companion to `tico-schema.prisma`. Written for whoever owns `client/prisma/schema.prisma`.

---

## Before anything else

**The database already exists.** Migration `20260902000000_init` ran on 2 September and the seed populated it. Seven tables are live: `users`, `tracks`, `lessons`, `exercises`, `submissions`, `user_progress`, `companion_chats`.

**This file does not replace them.** Every existing model is copied verbatim, with new fields marked `// + NEW`. I verified this with Prisma itself:

```
prisma validate                → valid, against Prisma 6.19.3
prisma migrate diff            → 24 new tables · 14 new enums · 23 ALTER TABLE
                                 0 DROP TABLE · 0 DROP COLUMN · 0 renames
```

Nothing you have built is touched. No existing row is at risk.

### Applying it

```bash
cd client
pnpm db:generate
pnpm db:migrate
```

**Never run `prisma migrate reset` against the shared database.** It uses `DROP CASCADE` and wipes everything. Prisma *offers* it whenever it detects drift, so it is always one tired `y` away. `migrate dev` is safe; `reset` belongs on a local throwaway database only.

Because one database is shared, **announce a migration before you push it**. Yours becomes everyone's the moment it lands.

---

## Why the schema needed extending

The existing schema is a clean, competent **generic coding LMS**. It is not yet TICO.

The gap is one thing, and everything else follows from it:

> `UserProgress` can tell you a student finished lesson 7.
> It can never tell you they took four attempts, burned hints 1 through 4, kept writing `=` instead of `==`, and are shaky on conditionals but fine on loops.
>
> **That second sentence is the student model. It is the product.**

The current schema records **outcomes**. Adaptive AI runs on **evidence** — the attempts, hints and hesitations *between* the outcomes. Parts 3 and 4 are that evidence.

---

## Vocabulary: the docs vs the schema

The design documents and the schema use different words for the same things. This mapping is worth pinning to a wall.

| Design docs | Schema | What it is |
|---|---|---|
| world / campaign | `Track` | Cairo Metro, Cairo Traffic, the Nile |
| lesson | `Lesson` | a teaching unit inside a world |
| mission / level | `Exercise` | the thing a student writes code for |
| submission | `Submission` | one run of that code |
| session | `PracticeSession` | one playthrough, start to finish |

A **Track is a world**, and a world spans several lessons before the student moves on.

---

## The tiers

Everything in the file is real, but it can be migrated in stages.

| Tier | Parts | What it is | If you skip it |
|---|---|---|---|
| **1** | 1–4 | Curriculum spine + AI evidence | Nothing can be adaptive. The AI claims in the proposal cannot be built. |
| **2** | 5 | Heroes, items, achievements, XP ledger, streaks | The game layer is cosmetic-only; `User.xp` stays a number nobody can explain. |
| **3** | 6 | Classrooms, subscriptions, notifications | No teacher features, no monetisation. Fine to defer past the competition. |

If time is short, **Tier 1 is the one that cannot wait.**

---

## Part 1 — existing models, extended

Seven models kept as they are. The additions:

| Model | Added | Why |
|---|---|---|
| `User` | `locale`, `gradeBand` | TICO speaks Egyptian Arabic; age shapes tone and reading level. |
| `Track` | `environmentKey`, `mentorPersona` | Links a world to its manifest in `ai-backend/content/worlds/`, and to the character TICO plays there. |
| `Lesson` | `isSkippable` | Some lessons must never be skipped, however good a diagnostic looks. |
| `Exercise` | `estimatedMinutes`, `xpReward` | Pacing, and XP that comes from content rather than a magic number. |
| `Submission` | **`sessionId`**, `attemptNumber`, `hintsUsedBefore`, `errorFamily`, `errorTag` | See below. |

### `Submission.sessionId` is the single most important added column

Without it, submissions float free. You can see *that* a student submitted six times, but never that those six were one continuous struggle on one mission with four hints in between. Every behavioural signal the student model uses depends on grouping submissions into a session.

---

## Part 3 — the curriculum spine

### `Concept`

The current schema has **no notion of a concept at all**. That is the blocking gap: without a concept axis there is nothing to measure a student *along*.

`sequenceOrder` is the roadmap: `variables → conditionals → loops → functions`. The order is **fixed and linear**. There is no prerequisite graph, because a linear roadmap is a sort column, not a DAG. Per-student variation lives in `LessonPlan` instead.

### `ExerciseConcept` — the most important new table

Learning is **cumulative**. A loops exercise still uses variables and conditionals. So every exercise has:

- **one target concept** — `isPrimary = true`, `weight = 1.0` — the new thing being taught
- **several carried concepts** — already learned, exercised again, `weight` around `0.2–0.4`

When a student finishes, the target's mastery moves at full weight and each carried concept moves at its own. **That is how early concepts stay alive without writing a single extra exercise.** A student who learned variables in week one keeps being assessed on them all course.

Getting these weights right matters more than almost anything else in the file. They are the difference between a system that notices someone quietly forgetting variables and one that does not.

---

## Part 4 — AI evidence

| Table | One row per | Why it exists |
|---|---|---|
| `PracticeSession` | playthrough | The keystone. Everything attaches here. Also the LangGraph `thread_id` for TICO's chat. |
| `HintEvent` | hint shown | Hint dependency is named in the proposal as a core input to the student model — nothing stored it. |
| `AiInteraction` | model call | Cost dashboard, bug log, eval dataset and child-safety audit trail in one table. |
| `ConceptMastery` | student × concept | The student model's spine. |
| `StudentProfile` | student | A cache, but it is what every prompt loads. |
| `LessonPlan` | student × lesson | The personal path through the fixed order. |
| `MissionTemplate` | authored mechanic | The bounds generation may not cross. |
| `GeneratedMission` | composed scenario | The AI's filled-in instance. |
| `ErrorTag` | error kind | Open vocabulary; starts empty and fills itself. |
| `HintCache` | cached hint | The primary cost lever. |

### `PracticeSession.exerciseId` is optional, on purpose

`SessionKind` is `LESSON`, `DIAGNOSTIC` or `CHALLENGE`. Diagnostic and challenge sessions have no lesson exercise behind them — the diagnostic exists to place a new student, and a challenge mixes concepts across the whole course.

### `AiInteraction` — build this first

It is the highest value-per-effort table in the file. When a judge asks how you control AI cost, you run a query instead of showing a slide. It is also your eval dataset and your safety audit trail, for free.

### Error classification is deliberately two-level

| Field | Kind | For |
|---|---|---|
| `errorFamily` | closed, 7 values | The numbers: `syntaxVsLogic`, the classifier eval |
| `errorTag` | **open** snake_case | The hint cache key, and a specific hint |

A closed enum alone is too narrow — beginners make contextual mistakes that a fixed taxonomy dumps into `unknown`, and an `unknown` produces a useless hint. Free text alone is worse: it breaks the cache (never equal twice) and the counts (you cannot count prose).

So the classifier returns both. The prompt carries the tags seen so far and either reuses one or coins a new one. **Constrain the shape, not the vocabulary.**

### `LessonPlan` — skipping is a suggestion, never a lock-out

An experienced student should not have to sit through everything to reach the part they do not know. After a diagnostic, each lesson is `REQUIRED` or `OPTIONAL`. The **order never changes; the membership does** — a filter over an ordered list, not a graph traversal.

`reason` and `decidedBy` make every skip auditable. `decidedBy = MODEL` means a model reviewed a risky call and overrode the rule — skipping on the evidence of one short diagnostic is inherently low-confidence, so every proposed skip gets reviewed. `Lesson.isSkippable = false` blocks it outright.

### `HintCache` is required, not an optimisation

Gemini's prompt caching will **not** help here: its context caching targets large contexts and carries minimum-token thresholds that short hint prompts never reach. This table is the primary cost control. Beginners fail in a small number of identical ways, so the hit rate on early lessons is high.

---

## Part 5 — the game layer

`User.xp` and `User.streak` already exist but nothing explains how they got their values.

- **`XpEvent`** is the ledger behind `User.xp`. Without it XP is a number nobody can explain and nobody can recompute after a bug.
- **`DailyActivity`** is what makes `streak` real rather than a counter someone increments and hopes is right.
- **`Hero` / `Item` / `Achievement`** with their join tables, from the original ERD.

Achievement `criteria` is JSON evaluated **in code**, not by a model — so unlocking is deterministic and testable.

**The leaderboard needs no table.** It is a query over `User.xp` with a `LIMIT`.

---

## Part 6 — classrooms, accounts, notifications

`Role.TEACHER` already existed but there was nowhere for a teacher to teach. `Classroom` + `ClassroomMember` fixes that, with a `joinCode` students type.

`Subscription` and `Notification` are scaffolding for things the proposal mentions. Honestly: **defer both past the competition** unless the demo shows them. Tables nobody populates are migration risk for no demo value.

---

## What I deliberately did **not** add

| Not added | Why |
|---|---|
| `pgvector` / embeddings / RAG | Not enough content volume. Templates and SQL filters beat vector search at this size. |
| A chat message table | `CompanionChat` already exists, and LangGraph keeps working state in its own `langgraph` schema. |
| Teacher analytics tables | Postgres views over what is already here. No new writes. |
| A leaderboard table | A query over `User.xp`. |
| An asset table | The world manifest in `ai-backend/content/worlds/` is the asset catalogue. |
| A/B and fine-tuning tables | Post-competition problems. |

---

## Four questions for the team

1. **Is the seed placeholder?** It creates a *"TypeScript Fundamentals Track"* and users called Alex Developer and Professor Tico. If real content is coming, `Track.language` should be `python` and the tracks should be Cairo Metro, Cairo Traffic and the Nile.
2. **Who owns `CompanionChat`?** It is fine as the readable chat record, but somebody should decide whether it or LangGraph's checkpoints are authoritative.
3. **Is `Exercise.hints` the authored fallbacks?** That is how it is documented here — one per rung, used when the model is unavailable or the answer-leak assertion rejects its output. Confirm it is not meant as a replacement for dynamic hints.
4. **Who sets the `ExerciseConcept` weights?** They need a human who understands the pedagogy, not a default. This blocks the AI backend's M4.

---

## What the AI backend does with all this

It **reads and writes** these tables through SQLAlchemy and **owns no migrations**. `client/prisma/schema.prisma` stays the single source of truth, exactly as the root `AGENTS.md` requires.

One consequence worth knowing: keeping the Python models in step with this file is manual. A rename here breaks Python at runtime rather than at migration time — which is the other reason to announce migrations before pushing them.

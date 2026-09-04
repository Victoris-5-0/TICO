# The API contract — `app/schemas/`

Every Pydantic DTO in the AI backend, what each field means, and why it is shaped that way.

**Who this is for.** Two people build against these and neither of them is me:

- the **AI teammate**, who writes `rules/` and `ai/` against these types with no database running
- the **Next.js developer**, who generates TypeScript from the OpenAPI spec these produce

Changing anything here changes somebody else's work. Say so before you do.

---

## How to read it

FastAPI turns these classes into `/openapi.json` automatically, so the client can generate typed calls:

```bash
npx openapi-typescript http://<url>/openapi.json -o client/src/lib/ai-api.d.ts
```

That means **the docstrings and `Field(description=...)` text in these files become the client's documentation**. They are not comments for us; they are the contract's prose.

Browse it live at `/docs` while the server runs.

### Two base classes

| Base | Used for | Behaviour |
|---|---|---|
| `Schema` | request and response bodies | `extra="forbid"` — an unexpected field is a 422, not a silent ignore |
| `ORMSchema` | anything read out of SQLAlchemy | `from_attributes=True`, `extra="ignore"` |

`extra="forbid"` is deliberate. If the client sends `sessionID` instead of `session_id`, you want to hear about it on day one, not discover in the demo that a field was silently dropped.

### Why every id is `str`

Prisma generates **cuid** strings (`cku1f9x...`), not integers or UUIDs. `str` accepts all three, so nothing breaks if the team ever changes id strategy.

---

## `common.py` — shared enums

### `Phase`

The seven-phase mission loop from the proposal: `ENCOUNTER`, `EXPLORE`, `DISCOVER`, `UNDERSTAND`, `GUIDED_CODING`, `ADAPT_REMIX`, `INDEPENDENT`.

Stored on `practice_sessions.phase`. The client advances it; the AI backend reads it to know how much help is appropriate — a hint in `DISCOVER` is a nudge, the same hint in `INDEPENDENT` is a failure signal.

### `SessionOutcome`

`IN_PROGRESS` · `SOLVED` · `ABANDONED` · `TIMED_OUT`

`ABANDONED` matters as much as `SOLVED`. **Quitting is evidence**, and a student model that only learns from completions is blind to the students you most need to notice.

### `HintRung` — an `IntEnum`, 1 to 4

| Rung | Name | Job |
|---|---|---|
| 1 | `ORIENT` | Point at the region. No diagnosis. |
| 2 | `QUESTION` | Make them think about the concept. |
| 3 | `NAME_IT` | Name the concept, show the pattern on a **different** example. |
| 4 | `WALK` | Walk to the fix in their own code, in words. |

It is an `IntEnum` so `min(count + 1, 4)` works arithmetically in `rules/hint_ladder.py`.

**No rung ever emits a complete solution.** After rung 4 the student goes to a mini-practice, not the answer. That is what makes "TICO never hands over the solution" literally true rather than "not until the last hint".

### `ErrorFamily` — closed, seven values

`SYNTAX` · `NAME` · `TYPE` · `LOGIC` · `INCOMPLETE` · `RUNTIME` · `UNKNOWN`

Coarse on purpose. This half exists so the **numbers** work: `syntax_vs_logic` is a count, and the classifier eval needs a fixed answer set to score against. You cannot build a stable metric on a set that grows.

The specificity lives in the open `tag` — see `AnalyzeResponse` below.

### `ScaffoldLevel`

`NONE` · `PARTIAL` · `FULL` — how much of a carried concept is pre-filled in the starter code.

This is the main lever of adaptation. Same mission, same world; a student strong on variables gets the counter pre-declared, a shaky one writes it themselves.

### `LessonRequirement` · `DecidedBy` · `SkillBand`

`REQUIRED | OPTIONAL | DONE | SKIPPED` — the personal path.

`RULE | MODEL` — **rules propose, the model reviews**. Always recorded, so any decision about a student can be explained to a teacher or a judge.

`STRUGGLING | ON_LEVEL | READY_TO_STRETCH` — the coarse band the composer works from.

---

## `sessions.py` — the keystone

A `PracticeSession` is one playthrough. Every hint, submission and model call attaches to it, and its id doubles as the **LangGraph `thread_id`** for TICO's chat.

| DTO | Direction | Notes |
|---|---|---|
| `SessionCreate` | in | `level_id` (the exercise), optional `generated_mission_id` |
| `SessionPhaseUpdate` | in | the client moves the student through the seven phases |
| `SessionClose` | in | `outcome` + `time_spent_ms` |
| `SessionOut` | out | the full row |

**Why this exists at all.** Without it, submissions float free. You can see *that* a student submitted six times but never that those six were one continuous struggle with four hints in between. Every behavioural signal depends on that grouping.

---

## `hints.py` — endpoint 1

### `HintRequest`

| Field | Notes |
|---|---|
| `session_id` | ownership is checked against the JWT |
| `code` | max 20 000 chars, exactly as typed |
| `error_text` | the real failure **from the engine**. This service never executes code. |
| `error_tag` | from `/submissions/analyze` if it ran. Sharpens the hint and forms part of the cache key. |

### `HintResponse`

| Field | Notes |
|---|---|
| `rung` | decided in **Python**, before any model call |
| `text` | TICO's words — Egyptian Arabic prose, English identifiers |
| `is_final` | true on rung 4 |
| `next_step` | `"mini_practice"` when final. Never the solution. |
| `cached` | served from Postgres with no model call |

`cached` is worth surfacing to the client. It is the number that tells you whether your cost control is working, and on early lessons it should be high — beginners fail in a small number of identical ways.

### The order matters

The server counts prior `hint_events`, fixes the rung, *then* calls the model and asks only for that rung's prose. The model is never shown the solution and never asked what comes next. **It cannot leak the answer because it was never given it.**

---

## `submissions.py` — endpoint 2

### The two-level design

`AnalyzeResponse` returns three things, and the reason is worth understanding because it is the least obvious decision in the contract.

| Field | Kind | Job |
|---|---|---|
| `family` | closed enum, 7 | counting: `syntax_vs_logic`, the eval |
| `tag` | **open** snake_case | the hint cache key, and a specific hint |
| `misconception` | free prose | the words TICO builds a hint from |

**A closed list alone is too narrow.** Students break things you did not predict; everything lands in `unknown`, and TICO says *"something is wrong, look at your code."*

**Free text alone is worse.** The same bug produces `"used a single equals"`, `"wrote = instead of =="`, `"assignment in condition"` — three strings, one mistake. The cache never hits, so you pay for every hint; and you cannot count prose, so mastery has nothing to work with.

Both together: `family` gives the numbers, `tag` gives the cache key, prose gives the hint.

### How the vocabulary grows

The classifier prompt carries the tags already in `error_tags`:

> Known tags: `assignment_vs_comparison`, `off_by_one`, `missing_colon`.
> Use one if it fits, otherwise coin a new short snake_case tag.

So it **starts empty and fills itself**. `is_new_tag` flags when the model invented one — a spike means go and look at what students are hitting.

The `tag` field is `pattern=r"^[a-z][a-z0-9_]*$"`, so a malformed tag is rejected before it can poison the cache key.

### The rest

`escalated` — low confidence triggered a second pass on the stronger model.
`in_scaffolded_region` — the student broke something the composer had scaffolded away, which says more about the scaffold than the student.

---

## `students.py` — endpoints 3 and 4

### `MasteryOut` and `StudentProfileOut`

`mastery` and `confidence` are `0..1` floats **computed in Python**. A model never produces them: the inputs are counts and the output is a number, which is the one shape where a model is strictly worse — slower, costlier, and different every call.

`syntax_vs_logic` is `0` for mostly-syntax errors and `1` for mostly-logic. It is the field that tells TICO whether to talk about colons or about thinking.

### `RefreshResponse`

Returns the profile, the per-concept mastery, and **`advanced` + `decided_by` + `reason`** — did the gate move the student on, who decided, and why. `reason` is always set when `decided_by` is `MODEL`.

### `PlanRequest` / `PlanResponse`

| Field | Notes |
|---|---|
| `is_beginner` | true marks every lesson `REQUIRED`, no diagnostic, **no model call** |
| `diagnostic_session_id` | required when not a beginner |
| `lessons` | one `LessonPlanEntry` per lesson, with `reason` and `decided_by` |
| `skipped_count` | the headline number for the UI |

**The concept order never changes. Which lessons are in the path does.** A filter over an ordered list, not a graph traversal. And a skipped lesson stays replayable — skipping is a suggestion, never a lock-out.

---

## `missions.py` — endpoints 5 and 7

### `ScaffoldPlan`

```python
scaffold: dict[str, ScaffoldLevel]   # concept_id -> how much is pre-filled
difficulty_band: int                 # 1..10
rep_number: int                      # 1 on a first attempt, higher on extra practice
```

Also part of the hint cache key: **TICO must not hint about a concept it scaffolded away.**

### `GeneratedMissionOut`

The composed scenario: `world_id` and `target_concept_id` were fixed by the roadmap before generation ran; `scene_id`, `brief`, `starter_code`, `tests` and `params` are what the model filled in, bounded by the world manifest.

Two fields carry the safety guarantees:

- **`validated`** — set by a Python validator function, never by the model claiming its own output is fine. An unvalidated mission is never returned.
- **`reused`** — an equivalent params + scaffold combination already existed. A direct cost saving.

`MissionTest.call` must use only verbs listed in the world manifest. If generation invents `gate.unlock()` and the engine implements `gate.open()`, the mission is unsolvable — the validator catches that before a child ever sees it.

### `NextMissionRequest`

Almost empty, and that is the point: **the student comes from the verified JWT, never from the body.** A client that could name any student in a request body is a client that could read any student's data.

---

## `tico.py` — endpoint 6, streamed

`TicoMessageRequest` is `session_id` + `message` (max 2 000 chars).

`TicoChunk` is one SSE frame — not a JSON response. The client needs an `EventSource` or a streaming fetch reader, **not `await res.json()`**. This is real frontend work and the client team should know early.

| Field | Notes |
|---|---|
| `delta` | text fragment to append |
| `done` | last frame |
| `blocked` | moderation rejected the input. `delta` carries a gentle in-character redirect and **no model was called**. |
| `offered_hint_rung` | the student asked outright for the answer; TICO refuses in character and offers the next rung |

---

## Rules that hold across every DTO

1. **Ids are `str`.** Prisma cuids.
2. **The student comes from the JWT**, never from a request body.
3. **`extra="forbid"` on requests.** A typo is a 422, not a silent drop.
4. **Nothing optional without a default.** Every `X | None` has `= None`.
5. **Enums, not free strings**, wherever the set is genuinely closed — and an open `str` where it genuinely is not. The `tag` field is the one deliberate exception, and it is pattern-constrained.
6. **Every response a student can see has an authored fallback path.** A child mid-mission never sees a 500.

---

## Changing a contract

The shapes are frozen from **5 September**, when the stubs go live. If one genuinely has to change:

1. Tell the Next.js developer **before** pushing. A silent field rename costs them more than it costs you, and neither schedule has slack to absorb it.
2. Update `app/schemas/`, redeploy, and tell them to re-run `openapi-typescript`.
3. Update this file.

Adding an **optional** field with a default is backwards-compatible and needs no ceremony. Renaming or removing one is a breaking change.

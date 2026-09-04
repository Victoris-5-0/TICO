# Endpoints — what each one does, step by step

Every route in the AI backend: the logic behind it, which layer does what, where the
model is called and where it deliberately is not, and what it writes.

Companion docs: `contracts.md` for the DTO field reference, `interfaces.html` for how the
client integrates, the architecture artifact for the design reasoning.

---

## At a glance

| Endpoint | Milestone | Model calls | Writes |
|---|---|---|---|
| `GET /v1/health` | done | none | nothing |
| `POST /v1/sessions` | M1 | none | `practice_sessions` |
| `PATCH /v1/sessions/{session_id}/phase` | M1 | none | `practice_sessions.phase` |
| `POST /v1/sessions/{session_id}/close` | M1 | none | `practice_sessions`, triggers refresh |
| `POST /v1/hints` | M2 | 1, cached | `hint_events`, `hint_cache`, `ai_interactions` |
| `POST /v1/submissions/analyze` | M3 | 1, small | `submissions`, `error_tags`, `ai_interactions` |
| `POST /v1/students/{student_id}/refresh` | M4 | 0–1 summary | `concept_mastery`, `student_profiles`, `lesson_plans` |
| `POST /v1/students/{student_id}/plan` | M4 | 1 per skip | `lesson_plans`, `student_profiles` |
| `POST /v1/missions/next` | M5 | 1–3 | `generated_missions`, `practice_sessions` |
| `POST /v1/tico/messages` | M6 | 1 streaming | `companion_chats`, checkpoints |
| `POST /v1/challenges/next` | M6 | 1–3 | `generated_missions`, `practice_sessions` |

**Nine of the eleven are stubs right now.** Shapes are final; behaviour is fake. Each
carries `X-TICO-Stub: 1` until its milestone lands.

---

## Cross-cutting rules

These apply to every route, so they are stated once.

### The layers

```
api/v1/        routers — HTTP in, HTTP out, no logic
services/      use-cases — orchestrate the rest
rules/         pure functions — no DB, no model, instantly testable
queries/       all the SQL
ai/            chains, graphs, prompts, guards
```

A router that contains an `if` about pedagogy is a router in the wrong place.

### Auth on every route

`Authorization: Bearer <token>` → verified → `user.id`. **The student is never named in a
request body.** Routes with `{student_id}` call `require_self`, which 403s when the token
belongs to someone else.

This matters more than it looks: the service connects to Postgres with credentials that
are not the student's, so **row-level security will not save you**. If a route forgets the
ownership check, any logged-in student can read any other student's data by changing an
id in the URL.

While `JWT_SECRET` is empty and `ENVIRONMENT` is not production, the service accepts
unauthenticated calls and returns a demo user so the client can integrate before the auth
question is settled. In production an empty secret is a hard 503.

### Errors a student might see

Every 4xx and 5xx returns `{ "detail": "...", "code": "..." }`. **`detail` is written for a
ten-year-old** and is safe to display. A model failure never becomes a 500 — the service
falls back to an authored response and still returns 200.

### Every model call is logged

One row in `ai_interactions`: capability, model, prompt version, tokens, cost, latency,
moderation verdict. No exceptions. It is simultaneously the cost dashboard, the bug
reproduction log, the eval dataset and the child-safety audit trail.

---

## `GET /v1/health`

**Real already. No auth.**

Does a genuine `SELECT 1` against Postgres and reports honestly:

```json
{ "status": "degraded", "environment": "development", "database": "unreachable" }
```

`degraded` with no `DATABASE_URL` is the **correct** answer. A health check that returns a
flat `ok` lies to you at exactly the moment you need the truth — when the pooler
connection has died but the process is still alive.

---

## `POST /v1/sessions` — open a session

**M1 · no model · writes `practice_sessions`**

A session is one playthrough. Everything else attaches to it, and its id doubles as the
LangGraph `thread_id` for TICO's chat.

### Steps

1. **api** — verify the token.
2. **queries** — confirm the exercise exists.
3. **queries** — insert `practice_sessions` with `phase=ENCOUNTER`, `outcome=IN_PROGRESS`,
   `kind=LESSON`.
4. Return the row.

`kind` is `LESSON`, `DIAGNOSTIC` or `CHALLENGE`. The last two have no lesson exercise
behind them, which is why `exercise_id` is nullable.

### Why it exists

Without it, submissions float free. You can see *that* a student submitted six times but
never that those six were one continuous struggle with four hints in between. Every
behavioural signal in the student model depends on that grouping.

---

## `PATCH /v1/sessions/{session_id}/phase`

**M1 · no model**

The client advances the student through the seven-phase loop: `ENCOUNTER`, `EXPLORE`,
`DISCOVER`, `UNDERSTAND`, `GUIDED_CODING`, `ADAPT_REMIX`, `INDEPENDENT`.

The backend reads it to calibrate help. A hint in `DISCOVER` is a nudge; the same hint in
`INDEPENDENT` is a signal the student was advanced too early.

---

## `POST /v1/sessions/{session_id}/close`

**M1 · no model · writes `practice_sessions`, triggers the refresh**

### Steps

1. **api** — verify token and ownership.
2. **queries** — set `outcome`, `time_spent_ms`, `ended_at`.
3. **services** — enqueue `student_model.refresh(user_id)` **in the background**.
4. Return immediately.

Step 3 is fire-and-forget. The student is looking at a success screen; they must not wait
for mastery recomputation.

**`ABANDONED` matters as much as `SOLVED`.** Quitting is evidence, and a student model
that only learns from completions is blind to exactly the students you need to notice.

---

## `POST /v1/hints` — TICO's hint mode

**M2 · 1 model call, heavily cached · writes `hint_events`, `hint_cache`, `ai_interactions`**

The first thing worth demoing, and the clearest illustration of the whole design rule.

### Steps

1. **api** — verify token; confirm the JWT owner owns this session.
2. **queries** — load the session, the student profile, and **count prior `hint_events`**
   for this session and concept.
3. **rules** — `hint_ladder.next_rung(count)` returns rung 1–4. *Pure Python. No model has
   been involved yet.*
4. **queries** — look up `hint_cache` on `(exercise_id, rung, error_tag, scaffold_state)`.
   **On a hit, skip to step 8.**
5. **ai** — `tico_hint` chain. The prompt carries the persona, the mission, the student
   profile, the rung's instruction and the error tag. **It is never given the solution.**
6. **ai/guards** — validate against the Pydantic model; assert no solution identifier
   appears at rungs 1–3 and no complete runnable line at rung 4.
7. **queries** — write `hint_cache`.
8. **queries** — write `hint_event`; increment `practice_sessions.hints_used`.
9. Return `{ rung, text, is_final, next_step, cached }`.

### The ladder

| Rung | Job |
|---|---|
| 1 | Orient — point at the region, no diagnosis |
| 2 | Question — make them think about the concept |
| 3 | Name the concept, show the pattern on a **different** example |
| 4 | Walk to the fix in their own code, in words |

**No rung ever emits a complete solution.** After rung 4, `next_step = "mini_practice"` —
a smaller exercise on that one idea, then back to the mission.

### Why the model cannot leak the answer

Because it was never asked for it. The rung is fixed in step 3, before any prompt exists,
and the prompt asks only for that rung's prose. This is stronger than instructing a model
not to reveal something — it is never given the something.

### Failure paths

| What | Response |
|---|---|
| Model unavailable or invalid output | Authored fallback from `exercises.hints[rung-1]`. Still 200. |
| Leak assertion fails | Discard, serve the authored hint, log a prompt regression. |
| Ladder exhausted | Final authored explanation, mark the session fully hinted — strong evidence for the student model. |
| Daily call cap hit | Cached or authored hints only. |

### Why the cache is required, not an optimisation

Gemini's context caching targets large contexts and has minimum-token thresholds that
short hint prompts never reach. **The Postgres cache is the primary cost lever.** Beginners
fail in a small number of identical ways, so the hit rate on early lessons is high.

### Stub behaviour today

Escalates rungs 1→4 per session id, in Egyptian Arabic, and reports `cached: true` from
rung 2 so the client can see both paths.

---

## `POST /v1/submissions/analyze` — code analysis

**M3 · 1 small structured call · writes `submissions`, `error_tags`, `ai_interactions`**

The engine has **already run the code**. This service receives the results and reasons
about them; it never executes student code. That boundary is what keeps the platform
deterministic.

### Steps

1. **api** — verify token and session ownership.
2. **rules** — if the code is empty or unchanged from the starter, return `INCOMPLETE` /
   `no_change` with **no model call**. That is a stalling signal, not an error.
3. **queries** — load the known tags from `error_tags`.
4. **ai** — `classify_error` chain with structured output. The prompt carries the code, the
   failure, and the known tag list.
5. **ai/guards** — reject any `family` outside the seven; normalise `tag` to snake_case.
6. **queries** — write `submissions.error_family` and `.error_tag`; upsert `error_tags`
   with an incremented count.
7. Return.

### The two-level design

| Field | Kind | Job |
|---|---|---|
| `family` | closed, 7 values | counting: `syntax_vs_logic`, the classifier eval |
| `tag` | **open** snake_case | the hint cache key, and a specific hint |
| `misconception` | free prose | the words TICO builds a hint from |

A closed list alone is too narrow — unexpected mistakes land in `unknown` and TICO says
*"something is wrong."* Free text alone breaks the cache (never equal twice) and the counts
(you cannot count prose).

The prompt shows the model the tags already seen and says: reuse one if it fits, otherwise
coin a new one. So the vocabulary **starts empty and fills itself**, and `is_new_tag` flags
when to go and look.

### Failure paths

Low confidence escalates once to the stronger model. Still unclear → `family=UNKNOWN` with
a descriptive tag. A vague family still leaves a usable cache key.

---

## `POST /v1/students/{student_id}/refresh` — the student model

**M4 · background · no model for the numbers**

Runs after a session closes. Nobody is waiting, so it can afford to be thorough.

### Steps

1. **api** — verify token; `require_self`.
2. **queries** — gather everything for this student: sessions, submissions, hint events,
   error families, timings.
3. **queries** — load `exercise_concepts` for each exercise played: which concept was the
   target, which were carried, and each weight.
4. **rules** — `mastery.update(...)` per concept. **Pure arithmetic.** The target concept
   moves at full weight; each carried concept moves at its own.
5. **rules** — recompute `hint_dependency`, `syntax_vs_logic`, `pace`, `skill_band`.
6. **rules** — `composer.advance_or_hold(...)` returns a decision **and a confidence**.
7. **ai** — *only if the evidence conflicts* (solved but leaned on every hint; fast but
   three failed attempts), a model reviews the whole profile and confirms or overrides,
   with a written reason.
8. **services** — the planner re-plans forward: real evidence beats a diagnostic, so a
   lesson still marked `OPTIONAL` can flip back to `REQUIRED` if mastery came out weaker
   than the skip assumed. Never un-skip something already passed.
9. **queries** — upsert `concept_mastery`, `student_profiles`, `lesson_plans`.
10. **ai** — optionally one call to write the human-readable summary, *after* the numbers
    exist.

### Why no model produces a mastery number

The inputs are counts and the output is a float. That is the one shape where a model is
strictly worse: slower, costlier, and different every call. A teacher asking "why is my
student on 0.4?" deserves an arithmetic answer.

### Step 4 is where cumulative learning pays off

A student who learned variables in week one keeps being assessed on them every time a
later exercise carries them — **without a single extra exercise being built**. That is what
`exercise_concepts.weight` buys.

---

## `POST /v1/students/{student_id}/plan` — the path planner

**M4 · a model reviews every skip · writes `lesson_plans`**

### Steps — beginner

1. Mark **every** lesson `REQUIRED`.
2. Seed `student_profiles` with low confidence.
3. **No diagnostic, no model call.**

### Steps — claims experience

1. **queries** — load the diagnostic session: solved or not, attempts, hints, error
   families, time.
2. **rules** — `plan.propose(...)` marks each lesson `REQUIRED` or `OPTIONAL` from the
   demonstrated mastery of its target concept, with a confidence.
3. **rules** — refuse outright any skip where `lessons.is_skippable = false`. This happens
   *before* the model is consulted.
4. **ai** — **every proposed skip** is model-reviewed. Not just the ambiguous ones:
   skipping on the evidence of one short diagnostic is inherently low-confidence.
5. **queries** — write one `lesson_plans` row per lesson with `reason` and `decided_by`.
6. **ai** — one call for the friendly summary.

### The rule that governs it

**The concept order never changes. Which lessons are in the path does.** A filter over an
ordered list, not a graph traversal. And a skipped lesson stays replayable — skipping is a
suggestion, never a lock-out.

If the model disagrees with the rule, the model wins and the disagreement is logged. A run
of those means the threshold is wrong.

---

## `POST /v1/missions/next` — the whole pipeline in one call

**M5 · 1–3 model calls · writes `generated_missions`, `practice_sessions`**

**This is where mission generation lives.** There is no separate `/generate` for students,
deliberately — see below.

### Steps

1. **api** — verify token. *The student comes from the JWT, never the body.*
2. **queries** — `lesson_plans`: the next lesson still marked `REQUIRED`, skipping
   `OPTIONAL` ones. Fixed order, a SQL read, **no decision**.
3. **queries** — `concept_mastery` for the target concept and each carried concept.
4. **rules** — `composer.compose(...)` returns the scaffold plan per carried concept, the
   difficulty parameters and the rep number. **Pure Python.**
5. **content** — load the world manifest for that track.
6. **ai** — `mission_gen` graph composes a scenario **against those parameters**: scene,
   characters, brief, starter code, solution, tests — selecting only from the manifest.
7. **ai/guards** — a **Python validator** re-reads the same manifest and checks every
   scene, prop and verb exists, that the solution passes its own tests, and that the target
   concept is actually exercised.
8. Invalid → feed the errors back and regenerate. **At most two repairs.**
9. **queries** — persist `generated_missions` with `validated = true`; open a
   `practice_session`.
10. Return.

### Why there is no student-facing `/generate`

A bare "generate me a mission" call would skip steps 2–4 — no lesson, no mastery, no
scaffold plan. You would get a mission that is *valid* but not *matched*: right world,
wrong difficulty, scaffolding either absent or smothering.

The composer's parameters are an **input** to generation, not an afterthought. Bundling
them into one endpoint makes it impossible to call generation ungoverned.

### What generation may and may not change

| May vary | May never vary |
|---|---|
| scene, params, brief wording, NPC lines, carried scaffold | world, target concept, mechanic, prop verbs, solution shape |

Enforced by `constraints` in the world manifest and asserted by the validator — not
trusted to the prompt.

### Failure paths

| What | Response |
|---|---|
| Invalid after two repairs | Fall back to the template defaults. The student gets a working mission, never an error. |
| Equivalent mission already generated | Reuse the row, `reused: true`. A direct cost saving. |
| Roadmap complete | Route to the challenge arena. |

### Why the validator is not optional

While writing `cairo_metro.yaml` by hand I made exactly the mistake it catches: the
`conditional_gate` mechanic allowed the `ticket_hall` scene, but that scene did not list a
`passenger_counter` — so a mission generated there would have asked a student to read a
counter that was not in the room. Unsolvable, and invisible on inspection.

**A careful human got that wrong in two minutes.** A model generating hundreds of missions
will get it wrong far more often.

---

## `POST /v1/tico/messages` — chat, streamed

**M6 · 1 streaming call · writes `companion_chats`, LangGraph checkpoints**

**Returns SSE, not JSON.** The client needs a streaming reader.

### Steps

1. **api** — verify token; reject if the session is closed. TICO has no context otherwise.
2. **ai** — **moderate the student's text before it enters any prompt.** Blocked → a gentle
   in-character redirect, `blocked: true`, and **no model is called**.
3. **rules** — detect asking outright for the answer. TICO refuses in character and offers
   the next hint rung via `offered_hint_rung`.
4. **ai** — load conversation state from the Postgres checkpointer, `thread_id = session.id`.
5. **ai** — build the prompt **stable-first**: persona, then mission, then profile, then —
   last — the student's message.
6. Stream `TicoChunk` frames.
7. **queries** — checkpoint the new state; append to `companion_chats`; log the call.

### Why the prompt order matters

Stable content first, volatile content last. It is the ordering any prompt cache needs, and
even where caching does not apply it keeps the persona from being crowded out by a long
conversation.

### Same service as hints, on purpose

Same character, same persona, same refusal rules. What differs is conversation state and
streaming — which is why TICO is one service and not three.

---

## `POST /v1/challenges/next` — the arena

**M6 · 1–3 calls · writes `generated_missions`, `practice_sessions`**

For students who finished the roadmap.

### Steps

1. **queries** — mastered concepts, **weighted toward the weakest**. A challenge should
   stretch, not flatter.
2. **rules** — composer sets **no scaffolding**, a shorter hint ladder, a higher difficulty
   band.
3. **ai** — generation composes a scenario mixing those concepts, in any world the student
   has visited.
4. **ai/guards** — validate exactly as in `/missions/next`.
5. **queries** — open a session with `kind = CHALLENGE`; record results against **every**
   concept touched.

### Failure paths

Fewer than two concepts mastered → keep it locked and say why. Repeated failure → drop the
difficulty band rather than reintroducing scaffolding. The arena's whole point is that
there is none.

---

## Proposed: `POST /v1/admin/missions/preview`

**Not built. Half a day inside M5.** Worth adding for two reasons that are not
student-facing:

1. **Content authoring.** Whoever writes a mechanic in the manifest needs to see what it
   generates before trusting it. Right now the only way is to be a student and play the
   lesson.
2. **Pre-warming before the demo.** Generate the common variants ahead of time so the first
   student of the day does not wait on a model call — and so you are not making a live
   Gemini call, subject to a rate limit, in front of a judge.

Takes a `template_id` and optional params; returns what generation would produce, without
a student and without persisting.

---

## How to tell a stub from the real thing

A stubbed response carries `X-TICO-Stub: 1`. When that header disappears from an endpoint,
its real logic has landed. The response body does not change — that is the entire point of
having stubbed the shapes first.

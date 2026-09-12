# Where the AI backend stands

Written 2026-09-10, at `a4d92ff`. Read this before picking the service up again; it says
what is true, what is owed, and what is deliberately unfinished.

Everything here is checkable. If this file and the code disagree, the code is right and
this file is a bug.

---

## All fifteen endpoints are real

No stubs. `meta.stub` is `false` everywhere, and `docs/endpoint-examples.md` has a captured
request and response for each — captured against the live database, not hand-written.

| endpoint | notes |
| --- | --- |
| `GET /v1/health` | |
| `POST /v1/sessions` | the keystone — everything else 404s without a session |
| `PATCH /v1/sessions/{id}/phase` | the hint ladder reads this |
| `POST /v1/sessions/{id}/close` | **mastery moves here**, once, idempotent |
| `POST /v1/sessions/{id}/debrief` | every number counted in Python |
| `POST /v1/hints` | rung counted server-side from `hint_events` |
| `POST /v1/submissions/analyze` | open tag vocabulary, read and written per call |
| `POST /v1/tico/messages` | SSE, no envelope |
| `POST /v1/missions/next` | 20–30s, Gemini + validator |
| `POST /v1/missions/by-lesson` | ~1s by default; 20–30s when `LIVE_MISSION_GENERATION` is on |
| `GET /v1/missions/{id}` | read-only, no model call |
| `POST /v1/missions/generate` | 20–30s, exercise-shaped and lossy |
| `POST /v1/challenges/next` | 20–30s, 409 when too few concepts mastered |
| `POST /v1/students/{id}/refresh` | rule proposes, model reviews conflicts only |
| `POST /v1/students/{id}/plan` | every skip model-reviewed; reviewer may only refuse |

## How to run the tests

```bash
python -m pytest -q                          # 422, what CI runs
REAL_DATABASE_URL=... python -m pytest -q     # 478, adds the live-database suites
TICO_LIVE_MODEL=1 ... pytest -q -m slow       # 2, actually calls Gemini
python -m pytest evals -q                     # 6, also a CI step
python scripts/check_manifests.py             # every manifest, every asset resolves
python scripts/gen_client_types.py --check    # the generated TS is not stale
```

The offline suite blanks `GOOGLE_API_KEY` in `conftest.py` so nothing can reach a model by
accident. `TICO_LIVE_MODEL=1` is the deliberate exception.

## How a student progresses

**The map is the contract.** A concept shows **3 stops**, and that is what the client
draws. If mastery is still short after those three the path extends, to at most **6**. At
six the concept ends whatever the number says — nobody is trapped on one idea, and concepts
are carried, so a weak one keeps getting practice inside the next.

    never needs a hint      3 stops
    uses a couple           4
    leans on every hint     6
    fails every time        6, then moves on anyway

`rules/progression` owns this. `POST /v1/students/{id}/refresh` returns `progress`: one row
per concept with `completed`, `stopsTotal`, `remaining`, `isComplete` and `extended` — enough
to draw the path without knowing anything about mastery. `extended` exists so the client can
say the path grew rather than silently showing more circles.

Mastery still decides *whether* the path extends, the scaffolding level, and arena entry —
it just no longer decides how long the road is. One threshold,
`rules/mastery.MASTERY_THRESHOLD = 0.75`, imported by the gate, the picker, the debrief and
the arena, so they flip together.

`DEFAULT_LEARNING_RATE = 0.40` is part of the same design, not a separate knob: three
observations is little evidence, so each must count. At the old 0.20 a perfect student
reached 0.488 after three clean solves and the path would have extended for *everyone*.

Passing scores all sit above the threshold (1.00 / 0.95 / 0.90 / 0.85 / 0.80) because this
score is the target of a moving average and therefore its ceiling. Until 2026-09-10 two
hints scored 0.70 against a 0.70 gate, so a student who leaned on hints could never finish
a concept at all.

## The three fences on generation

A generated mission has to get past all three. They fail differently, and the third exists
because the first two cannot see it.

1. **Vocabulary** — `vocabulary`, `characters`. Wrong here and the prose reads as though
   nobody looked.
2. **`visual`** — sprites, states, animations. Wrong here and the screen is dead while the
   code still looks correct.
3. **`simulation`** — the scene's own quantities and controls. Wrong here and *everything*
   looks correct: the Python runs, the tests pass, the validator signs it off, and the child
   is taught that a tray holds twelve loaves while watching eight land on it. This is the one
   that shipped broken, twice — once with no guard at all, and once with a guard that read
   three of the four code surfaces. See `phase_guards._check_arithmetic` and "Recently
   closed" below.

`el_forn` is the only world with a `simulation` block, because it is the only one with a
running interactive scene. The other two must keep loading without one.

## Recently closed

**The debrief showed a child the model's scratchpad** (2026-09-11). `write_debrief`
borrowed `max_tokens_hint` (400) for its budget. The model spends that budget reasoning
before it writes, so the sentence arrived truncated mid-word — and once it did not arrive
at all, leaving ``no_error`, `incomplete_assignment` (this means they`` on the
mission-complete screen. Seen in the browser, not in a test.

Two changes: `max_tokens_debrief = 1200` so the sentence has room after the reasoning, and
`looks_like_tico()` — a shape check that rejects a reply carrying backticks, English
narration about the learner, or too little Arabic to be a TICO line, and falls back to the
authored text. The existing number guard catches a debrief that says something *false*;
this catches one that is not a debrief at all.

**The arithmetic fence had a hole at `remix.solution_code`** (2026-09-11).
`_check_arithmetic` read `understand.code`, `guided.solution_code` and
`remix.starting_code` — every code surface a student sees except the one phase 6 asks
them to write. Told to change the world, the model reaches for the nearest number: a
mission shipped `validated: true` announcing "Hassan brought bigger trays that hold 12"
with an honest `= 8` in `starting_code` (so the checked field passed) and
`loaves_per_tray = 12` in the solution, against a scene that draws eight. The committed
`docs/example-mission-response.json` had the same shape at `= 10` and had been used as a
test fixture in that state.

Three things changed, because the guard alone was not the whole failure:

- `_check_arithmetic` now reads `remix.solution_code` too.
- `_simulation_block` tells the model the phase 6 twist may not renumber a fixed
  quantity, next to the numbers themselves — the prompt already listed them and the
  model overrode them anyway. `PROMPT_VERSION` is now `mission_gen/v3-remix-keeps-fixed-numbers`.
- The example fixture's twist reserves loaves for neighbours instead of resizing the
  tray, so it invents its own quantity rather than redefining one the scene owns.

Phase 6 is still free to change the world; it is not free to renumber what the scene
already draws. `test_a_remix_that_invents_its_own_quantity_is_fine` pins that difference.

`practice_sessions.lesson_id` (migration `20260910120000_session_lesson_id`, applied
2026-09-10). `SessionOut.levelId` used to be null for every generated mission because there
was nowhere to store what the client sent. It round-trips now, and an unknown lesson is a
422 rather than a foreign-key error surfacing as a 500.

## Deliberately unfinished

Two features are implemented and unreachable because Prisma owns migrations and lives in
`client/`. Each is recorded at the point it is blocked rather than faked:

- **under-13 static hints** — `write_hint(static_only=True)` works; nothing can set it,
  because no table records an age. **Deliberately left blocked on 2026-09-10**: storing a
  child's date of birth or age band is a privacy decision with legal weight, and Ahmed
  chose not to make it yet. Do not add the column without asking. `app/services/hints.py`
- **per-session diagnostic scores** — `build_plan` accepts `diagnosticSessionId` and cannot
  use it. `app/services/students._diagnostic_scores`

Also owed: **`generation_legality_eval.py`**. It asked the right question — does generation
stay inside the closed manifest vocabulary — and was written against the props-and-verbs
generator deleted in #6. Nothing checks that at the eval level today. The original is on the
`ai/eval` branch to rewrite from; see `evals/README.md`.

## Things that were true and are not any more

Worth knowing, because docs and comments elsewhere may still assume them.

- **Auth is Better Auth, not Supabase.** `app/core/auth.py` validates an opaque session
  token by looking it up in the shared database. It verifies; it never issues.
- **Missions are six phases, not props and verbs.** `gate.open()` and
  `station.passengers` are from a deleted world model. The real content is plain Python
  functions.
- **bakery-v2 is the renderer.** `visual.backdrop` is `bakery-v2/environment.webp`, not a
  top-down still. `content/worlds/_el_forn_bakery_v2_inventory.yaml` is the source it was
  merged from — the `_` prefix keeps the loader out of it.
- **`_stub.py` has no callers.** Kept for the next endpoint that ships shape-first.

## Branches

`ai/*` branches fork from a point before most of the backend. Check
`git rev-list --count <branch>..origin/main` before merging one; if it is large, cherry-pick
onto a fresh branch off main. `ai/foundations` was reconciled by hand and recorded with
`git merge -s ours` (`14b6da1`), so a future merge of it is a no-op.

PR #9 (`ai/eval`) is still open and would revert most of main. Its usable half is already
on main via #11.

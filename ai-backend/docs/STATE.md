# Where the AI backend stands

Written 2026-09-10, at `a4d92ff`. Read this before picking the service up again; it says
what is true, what is owed, and what is deliberately unfinished.

Everything here is checkable. If this file and the code disagree, the code is right and
this file is a bug.

---

## All thirteen endpoints are real

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
   that shipped broken; see `phase_guards._check_arithmetic`.

`el_forn` is the only world with a `simulation` block, because it is the only one with a
running interactive scene. The other two must keep loading without one.

## Recently closed

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

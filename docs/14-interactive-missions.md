# 14 — Interactive missions: state, and the architecture change

**Branch:** `feat/interactive-missions` · **Opened:** 2026-09-13 · **Status:** design agreed, build not started
**Rebased on `origin/main` @ `7efd27b`** — includes the lessons-from-AI-backend work, the
worlds map, the landing bakery demo and the generation loading overlay.

**For writing a mission, read [`15-mission-authoring.md`](15-mission-authoring.md) instead.**
This document is the architecture and the longer plan; 15 is the recipe.

This document exists so the work can be handed to a different agent mid-flight. It says
what is true right now, what was already built, what the architecture has to become, and
in what order. Read it before `AGENTS.md` §7 — that section describes the asset lane and
is older than this.

---

## 1. What we are actually trying to deliver

> *"An interactive learning game with consequences."*

Three words, each of which the current build fails in a different way:

| word | what it has to mean | today |
| --- | --- | --- |
| **interactive** | the child acts on the world — clicks the oven, turns the sign, types a number and watches bread appear | they pick a radio button and press Run |
| **game** | the world is the screen; people walk in, speak, react | the world is a picture beside a panel of text |
| **consequences** | what they wrote changes something that persists — flour runs down, the till goes up, a loaf burns | the scene plays a canned animation and resets |

The opening tour (`/worlds/el-forn/missions/opening-message`) already does all three. The
missions do none of them. **That gap is the whole job.**

---

## 2. Where each layer stands

### 2.1 Game UI — two engines, only one of them good

| | `ScriptPlayer` (new) | `MissionPlayer` (old) |
| --- | --- | --- |
| file | `client/src/components/bakery/script-player.tsx` | `client/src/components/mission-player/mission-player.tsx` |
| used by | the opening tour | every lesson |
| speech | bubbles over the speaker's head, in the scene | a panel beside the scene |
| interaction | click the lit prop; type with live binding | radio buttons; blanks; Run |
| world | walking, handover, payment, money, sacks, sign | one canned animation per phase |
| driven by | an authored `Script` array | `PhasedMissionOut` from the database |

`ScriptPlayer` is the one to keep. `MissionPlayer` is ~1000 lines carrying things
`ScriptPlayer` does **not** yet have and must not lose: the hint ladder, narration audio,
telemetry per phase, the debrief screen, and the exit panel.

### 2.2 The scene — rebuilt, shared, good

`client/src/components/bakery/scene.tsx` + `client/src/lib/bakery/scene-manifest.ts`.

Re-drawn on 2026-09-13 against a new `environment.webp` (a wide empty arch). Every fixture
is now a rectangle in `fixtures`, and the bake choreography — peel travel, oven fire, where
loaves land — is derived from those rather than hard-coded, so the art can move again
without eleven numbers going stale.

Supports: `loose` props (20 placed frames), `cast` (who is drawn), `highlight`, `pickable`
+ `onPick`, `sign`, `sacks`, `preview` (live binding).

### 2.3 The simulation — real, and the only source of world truth

`client/src/lib/bakery/simulation.ts`. A reducer with phases
`idle · arriving · loading · baking · retrieving · stocking · handover · paying · exiting ·
advancing · complete`, plus `money` and `charge`.

`arriving` and `paying` were added for the tour. **The manifest does not know about them**
(see 2.5) and `undrawnProps`/`isScenePhase` in `mission-scene.ts` were reverted with the
old player, so `mission-scene.ts` still lists the old phases only.

### 2.4 Missions in the database — the trap that cost two rounds

Missions live in `generated_missions.content`. Since the merge with `main`, which mission a
student gets is decided **by the AI service**, not here:

```
worlds/<world>/play/<lesson>          a page with the generation overlay
        │
        ▼
startLessonMissionAction              src/actions/mission.ts
        │
        ▼
missionService.startForLesson({ worldSlug, lessonSlug, … })
        │
        ├── the AI service picks the prepared mission for that stop,
        │   or composes one live when LIVE_MISSION_GENERATION is on
        └── startForStudent(...)      fallback, when the service is unreachable
        │
        ▼
/worlds/<world>/missions/<missionId>?lesson=<slug>
```

**This is good for the plan.** Selection is already keyed by world + lesson, which is the
same key §4 wants authored scripts keyed by. The client no longer holds an opinion about
which row to serve, and `LIVE_MISSION_GENERATION` means generation can be switched off
without touching client code.

**There is still more than one row per lesson,** and the fallback path picks between them.
`variables-1` has two:

| id | title | encounter speaker |
| --- | --- | --- |
| `cmtwklihyqt4p01z00z8ue6zx` | حسبة الدقيق السريعة | a stranger, "أنا مستعجل" |
| `cmtyoknlbyf1t05b421irls62` | صواني العيش البلدي | `omar` |

Which one a student gets is whichever the claim service picks. **Therefore: never key
authored content by mission id.** Key it by lesson slug. This was the single biggest
wasted effort in this work — content was authored into one row and the other was served.

### 2.5 The world manifest — the fence that has not moved

`ai-backend/content/worlds/el_forn.yaml`. Generation may only use what is declared here,
and `ai/guards.py` re-validates after generation.

What is missing, and blocks generation from ever producing what the tour does:

- `visual.sprites` lists **15** ids. The 40 cut frames (`till`, `scale`, `ticket-stand`,
  `order-clipboard`, `bread-board`, `scooter-crate`, …) are not among them.
- `flour-sack` is not `countable`, so no mission can say "three sacks left".
- There is no `sign` sprite, so no mission can open the shop.
- `visual.animations` has no `arriving` and no `paying`.
- `visual.actions` already declares `bind`, `write`, `set`, `face`, `focus` — **the client
  implements none of them.** `bind` is exactly the live binding the tour does by hand.
- `simulation.controls` declares `bake` and `serve` as pressable, and no mission can
  present a button.

### 2.6 The mission contract

`client/src/lib/ai/types.ts`, **generated** from `/openapi.json` by
`python ai-backend/scripts/gen_client_types.py`. Do not hand-edit it.

`PhasedMissionOut` → six phases. The shape is fine. `WorldChange` already carries
`animate`, `actions`, `props` and `captionAr`; `PhaseEncounter.world` carries the scene at
rest. **The contract is not the bottleneck — nothing on the client consumes `actions`, and
there is no way for a phase to say "let them press this" or "this persists".**

### 2.7 Generated content quality

Two defects, both structural rather than prompt-level:

1. **No continuity.** A model composing one scenario has no memory of the tour or of the
   previous mission, so it invents a stranger with a requirement. Lesson 1's generated
   mission opens with someone who never appears again.
2. **Wrong concept.** The `variables` lesson's generated mission teaches
   `def calculate_flour_weight(flour_sacks: int) -> int:` — a **function**, several lessons
   early. The manifest describes function signatures (`docs`: "the real content is plain
   Python functions"), so the generator is doing what it was told; what it was told is
   wrong for the early lessons.

---

## 3. What is already built on this branch

Committed to nothing yet; all working-tree changes on `feat/interactive-missions`.

**Live and working:**

- `client/src/lib/bakery/script.ts` — the `Stop`/`Script` types, `worldAt`, `boundValue`.
- `client/src/lib/bakery/world-tour.ts` — the opening tour, 51 stops, authored.
- `client/src/components/bakery/script-player.tsx` — the engine.
- `client/src/components/bakery/scene.tsx` — the rebuilt scene.
- `client/src/lib/bakery/simulation.ts` — `arriving`, `paying`, `money`, `charge`.

**Built but deliberately NOT wired** (the route still renders `MissionPlayer`):

- `client/src/lib/bakery/missions/opening-message.ts` — lesson 1 as a script, six rungs,
  clicks, walking customer, live-bound typing, payment, consequences.
- `client/src/lib/bakery/missions/index.ts` — the lesson-slug registry.
- `client/src/lib/bakery/missions/opening-message.test.ts` — plays the whole mission
  through the real reducer.

**Untouched, restored to `HEAD`:** the mission route, `MissionPlayer`, `mission-scene.*`,
and both prebuilt mission JSONs. The old experience is exactly as it was.

**Tests:** `pnpm test` — 43 passing.

---

## 4. The architecture change

The principle, already in `AGENTS.md` and `docs/12`, applied properly for the first time:

> **Author the beats. Generate the dressing.**

Today generation owns the beats *and* the dressing, and the client owns the rendering with
no idea what either means. The change moves the boundary.

### 4.1 New shape

```
   AUTHORED (a person, in git)          GENERATED (a model, per student)
   ───────────────────────────          ───────────────────────────────
   the beat structure of a lesson       which neighbour walks in
   which rung each beat belongs to      what they ask for, in their voice
   what the child clicks and types      how many sacks are left today
   the consequence of each beat         TICO's wording of a hint
           │                                      │
           └──────────────┬───────────────────────┘
                          ▼
                 a Script the client plays
                          │
                          ▼
            ScriptPlayer  ×  the bakery reducer
                          │
                          ▼
              world state that PERSISTS across missions
```

### 4.2 Layer by layer

**Frontend / game UI**

- `ScriptPlayer` becomes the only mission engine; `MissionPlayer` is deleted **after** its
  hint ladder, narration, telemetry and debrief are ported into it.
- Implement `visual.actions` for real: `bind` (have it), `write`, `set`, `face`, `focus`.
- Implement `simulation.controls` as real buttons a beat can present.

**Contract (`schemas/` → regenerate `types.ts`)**

- A `Script`-shaped DTO: an ordered list of beats with `kind`, `phase`, `speaker`, `look`,
  `action`, `world`, `code`. Effectively `script.ts` promoted to the wire.
- `WorldFacts` on a beat (sign, sacks, money) — the persistent half.
- Keep `PhasedMissionOut` alongside until every lesson has a script; do not break it.

**AI backend**

- Generation stops composing six free-text phases. It fills **slots** in an authored
  skeleton: speaker, order quantity, line wording, prop choice.
- `ai/guards.py` gains: the target concept's syntax fence (a `variables` lesson containing
  `def` is rejected), and continuity (the speaker must be someone the world has met).
- `content/worlds/el_forn.yaml`: add the 40 frames to `visual.sprites`, make `flour-sack`
  countable, add a `sign` sprite with `[open, closed]`, add `arriving` and `paying` to
  `visual.animations`.

**Database (Prisma, `client/prisma/schema.prisma` — Ahmed owns this)**

- A per-student world row: money, flour, reputation. **This is what "consequences" means.**
  Money that resets between missions is a score, not a game.
- One row per lesson per student for the claim path, or drop the pool for authored lessons
  entirely — the two-rows-per-lesson ambiguity in §2.4 must not survive.

---

## 5. Work order

Each step is shippable and unblocks the next.

| # | Step | Layer | Unblocks |
| --- | --- | --- | --- |
| 1 | Wire `AUTHORED` into the mission route by lesson slug — the same key `startForLesson` already uses | FE | lesson 1 plays as a script |
| 2 | Port hint ladder + narration + debrief into `ScriptPlayer` | FE | retiring `MissionPlayer` |
| 3 | Persistent world row (money, flour) + read it in `ScriptPlayer` | DB, FE | consequences |
| 4 | Extend `el_forn.yaml` (sprites, sign, animations, countable flour) | AI | generation can describe the real world |
| 5 | Author lessons 2–4 as scripts | content | the whole world plays |
| 6 | Slot-filling generation against an authored skeleton | AI | variety per student |
| 7 | Guards: concept fence + continuity | AI | no more `def` in lesson 1 |
| 8 | Delete `MissionPlayer`, regenerate `types.ts`, update `AGENTS.md` §7 | all | one engine |

**Steps 1–3 deliver the promise.** 4–7 make it scale. 8 is cleanup.

---

## 6. Traps — read before writing code

1. **Never key content by mission id.** §2.4. Key by lesson slug.
2. **The JSON in `ai-backend/content/prebuilt/` is not what renders.** The page reads
   `generated_missions.content` from the database. Editing a file changes nothing until
   `pnpm mission:import <file>` runs.
3. **`client/src/lib/ai/types.ts` is generated.** Change the Pydantic DTO, then run
   `python ai-backend/scripts/gen_client_types.py`.
4. **`el_forn.yaml` is a fence, not documentation.** A sprite absent from it cannot appear
   in a generated mission, however well the client draws it.
5. **No functions before the functions lesson.** Concept order is fixed and linear:
   variables → conditionals → loops → functions.
6. **The camera never moves.** No zoom, no pan. Point at things by lighting them up.
   Settled after it was tried and rejected.
7. **The React Compiler lint forbids `setState` in an effect.** Every animation in
   `ScriptPlayer` is dispatched from the click that enters a beat, never from a render.
8. **Reduced motion is a requirement**, per `docs/design.md`.
9. **Before touching `ai-backend/`,** read `ai-backend/AGENTS.md` in full — it says so
   itself, and `docs/STATE.md` first.
10. **The hint ladder now lives in the AI backend**, not the client. Porting hints into
    `ScriptPlayer` (step 2) means calling that service, not reimplementing rungs.
11. **`bakery-world-demo.tsx` is live on the landing page** with `autoPlay` and `loop`. It
    was deleted once during this work and had to be restored — it holds a
    `Record<Phase, string>`, so **every new simulation phase needs copy added there** or
    the build breaks.

---

## 7. What went wrong in the attempt before this document

Recorded so it is not repeated.

- **Authored content into the wrong mission row**, twice, because of §2.4. The fix is the
  lesson-slug registry, not better care.
- **Treated it as a content problem.** Replacing the text of a generated mission leaves
  every structural defect in place — the panel UI, the canned animation, the reset world.
  The user's objection was architectural and the response was editorial.
- **Read "don't attach a mission to the tour" as "don't use the tour engine for missions".**
  Opposite of the intent, and it cost a rebuild.

`AGENTS.md` §7 currently describes the asset lane and the interactivity work as *"discussed
and agreed, not yet built"*. That is now stale in both directions: much of it is built, and
the plan has changed shape. **Step 8 must update it,** and until then this document wins.

---

## 8. Commands

```powershell
cd client
pnpm test          # 43 tests: scene, simulation, tour, authored mission
pnpm typecheck     # scripts/shot.ts fails until `pnpm install` pulls playwright
pnpm dev
pnpm shot /ar-EG/worlds/el-forn/missions/opening-message tour.png 1600 1000
```

The opening tour, which is the reference for everything above:
`/ar-EG/worlds/el-forn/missions/opening-message`

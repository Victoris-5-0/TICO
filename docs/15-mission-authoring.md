# 15 — How a TICO mission is built

**Branch:** `feat/interactive-missions` · **Written:** 2026-09-14
**Read this before writing a mission.** It is meant to be handed to an agent cold.

`docs/14-interactive-missions.md` covers the architecture and the longer-term plan. This
document covers one thing: **what a mission is, and how to make another one.**

---

## 1. The one that works

`رسالة الفتح` — El Forn, lesson `opening-message`, concept `variables`. Play it before
writing anything:

```
/ar-EG/worlds/el-forn/missions/cmtwklihyqt4p01z00z8ue6zx?lesson=opening-message
```

It is the reference. Everything below describes how it is put together.

---

## 2. The shape

A mission is a `PhasedMissionOut` JSON in `ai-backend/content/prebuilt/`, imported into
`generated_missions.content`. Six phases, fixed order, and the client renders them into the
bakery rather than into a panel beside it.

### 2.1 Three beats the child acts on

This is the rule the good mission follows and the generated ones do not. **Every mission
has three moments where the child does something to the world**, and they escalate:

| beat | what they do | in `رسالة الفتح` |
| --- | --- | --- |
| 1 | **click** a prop — no code | press the sign; it turns مقفول → مفتوح |
| 2 | **write** one value — the world answers | `sign = "open"` |
| 3 | **write again**, after the world moves | a customer arrives and orders → `loaves = 5` |

Beat 1 is not decoration. It is the child changing the shop before they have been asked to
write anything, so that by the time they type, they already know what typing is *for*.

### 2.2 Where each beat lives in the six phases

```
encounter    beat 1   world.props.press = "<prop>"   →  no Continue button, the prop is the way on
explore      —        two questions, highlight the thing being asked about
discover     —        name the concept. three lines, no syntax
understand   —        the finished line, read-only, Run plays it
guided       beat 2   one blank. the world changes on Run
remix        beat 3   worldChange plays a SEQUENCE, then they write again
```

### 2.3 Sequences: nobody appears out of nowhere

A phase may carry `steps` on its `worldChange` or `onRun` — an ordered list of beats the
scene plays back to back, each speaking its own line over the character saying it.

```jsonc
"worldChange": {
  "animate": "loading", "props": { /* the resting world */ },
  "steps": [
    { "animate": "loading",    "props": {…}, "speakerNameAr": "عم حسن",   "lineAr": "…" },
    { "animate": "baking",     "props": {…}, "speakerNameAr": "عم حسن",   "lineAr": "…" },
    { "animate": "stocking",   "props": {…}, "speakerNameAr": "عم حسن",   "lineAr": "…" },
    { "animate": "arriving",   "props": {…}, "speakerNameAr": "عم حسن",   "lineAr": "…" },
    { "animate": null,         "props": {…}, "speakerNameAr": "مدام مريم", "lineAr": "…" }
  ]
}
```

**A customer must walk in before anybody talks about her.** The twist sequence is the bake,
the arrival and the order; the `onRun` sequence is `handover → paying → exiting`. A beat
with `animate: null` holds ~2.2s so its line can be read.

### 2.4 Consequences

The world keeps score, visibly:

- `flour-sack` goes **down** when a batch is baked
- `loaf` goes **down** when an order is handed over
- `total_price` and `loaves` appear as readouts beside the scene
- a run that does **not** pass, while a customer is waiting, shows her impatient with
  «بسرعة عشان مستعجلة» until the next run

---

## 3. What we do not want

Every one of these is a real defect found in the generated missions, not a hypothetical.

| ✗ | why |
| --- | --- |
| A stranger announcing a requirement — «يا جماعة أنا مستعجل» | no relation to the story before it. The child has met these people |
| `def calculate_flour_weight(...)` in the **variables** lesson | concept order is variables → conditionals → loops → **functions**. The last one is being taught first |
| `orders: list` before loops | same problem, quieter |
| A Continue button under a sentence about pressing something | if the mission says press it, pressing it must be the way on |
| One animation per phase | it is why customers teleported. Use `steps` |
| A wrong answer that only reddens a test row | it has to mean something in the shop |
| Eight neighbours in every scene | `queue: 1` when the mission is about one person |
| A bare counter | pass the prop table; the shop is furnished |
| Missions that could be shuffled | they are a morning in a bakery, in order |

---

## 4. What to build next

**Four missions, in this order.** Each one continues the morning the last one ended.

| # | lesson | concept | the day moves on |
| --- | --- | --- | --- |
| 1 | `opening-message` | variables | ✅ **done** — open the shop, serve Mariam |
| 2 | `count-the-trays` | variables | the rush: more than one customer, counting stock |
| 3 | `fair-share` | conditionals | enough bread or not — the first `if` |
| 4 | *(needs a lesson)* | conditionals | the oven runs hot — burnt bread as a consequence |

`el-forn` currently has four lessons: `opening-message`(1) and `count-the-trays`(2) teach
variables, `fair-share`(4) teaches conditionals, `morning-batches`(5) teaches loops. **A
second conditionals lesson does not exist yet** — either add one, or make mission 4 the
second *stop* of `fair-share`.

### 4.1 Serial, not isolated

Mission 2 opens with the shop **already open** and بقايا from mission 1 — three loaves on
the tray, three sacks of flour, ٢٥ جنيه in the till. Mission 3 opens where 2 ended. Hassan
should refer back: «زي امبارح» / «فاكر لما…».

### 4.2 Vary the cast — there are eleven, not one

Walk-cycle atlases in `public/assets/bakery-v2/`, all drawable in the queue:

> `hassan` `mariam` `nour` `amina` `omar` `dina` `youssef` `hoda` `farid` `farid-saidi` `salma`

Front-facing **impatient** frames in `frames/` for a failed run:

> `angry-mariam` `cross-girl-red` `cross-elder-grey` `cross-elder-turban` `cross-man-blue`
> `cross-woman-teal` `cross-woman-green` `cross-woman-navy` `cross-woman-ochre`
> `cross-woman-white` `cross-woman-folded` `cross-boy-backpack` `cross-baker`

**Pair them sensibly** — an impatient frame should look like the customer it belongs to.
`angry-mariam` matches `mariam`; pick the rest by dress colour. Today the impatient frame
is hard-coded to `angry-mariam` in `scene.tsx`; making it follow the active customer is a
small change and should be done as part of mission 2.

### 4.3 Vary what they write

Not four missions of "put a number in a variable":

- a **string** on a surface — `sign = "open"` *(done)*
- a **count** — `loaves = 5` *(done)*
- **arithmetic between two variables** — `left = baked - sold`
- a **comparison** — `enough = loaves >= order`
- an **`if`** that changes what the shop does

### 4.4 Objects that are placed and unused

All drawn, all clickable, none yet load-bearing in a mission: `scale` `till` `coin-drawer`
`ticket-stand` `ticket-discs` `order-clipboard` `bread-board` (the burnt loaf)
`paper-bag-stack` `dough-table` `tray-stack` `bread-crate` `scooter-crate`.

`bread-board` carries a burnt loaf — it is the asset for the burnt-bread consequence in a
conditionals mission.

---

## 5. Getting a mission live

Four steps. **Order matters.**

```powershell
cd client
# 1. author  ai-backend/content/prebuilt/<concept>-<stop>-<missionId>.json
# 2. validate
pnpm test
# 3. write the content into the row
pnpm mission:import ../ai-backend/content/prebuilt/<file>.json
# 4. put it in the pinned set  ← AFTER importing, always
pnpm mission:pin --write
```

**`mission:import` overwrites `params`, which wipes the pin.** Importing after pinning
silently un-pins the mission, `find_prebuilt` stops seeing it, and the lesson falls through
to generation. This cost hours. Import first, pin second, every time.

### 5.1 How the file name matters

`variables-1-<missionId>.json` → concept `variables`, **stop 1**. The pin script reads the
stop out of the file name. `pinnedForLesson` then picks by the lesson's index among the
lessons teaching that concept.

**One file per stop.** There are currently *two* `variables-1-*` files and both get pinned
as stop 1, so `count-the-trays` would be handed a stop-1 mission. Delete the duplicate
(`variables-1-cmtyoknlbyf1t05b421irls62.json`) when mission 2 is written.

### 5.2 Removing the generated missions

There are 13 of them and **they are what lessons 2–4 currently play.** Deleting them before
their replacements exist leaves those lessons with nothing.

**Do it last, per lesson**: author the replacement → import → pin → *then* unpin or delete
the generated row it displaced. Never as one bulk delete.

---

## 6. How the model sees a mission

Hints are the AI backend's job now (`0857de6`). `requestHint` sends `sessionId`,
`missionId`, the code so far, the last result, the locale and the guided step. The service
reads the mission row from the shared Postgres, counts prior `hint_event` rows, fixes the
rung in `rules/hint_ladder.py`, and the model writes prose for **that rung only**.

**So an authored mission is already visible to the model** — it is in `generated_missions`
like any other. Two things make its hints good:

1. **`hintAr` on each guided step.** Used verbatim as rung 1 and as the fallback when the
   service is unreachable. Write it.
2. **`solutionCode` must be correct.** The ladder is forbidden from emitting a complete
   solution, and rung 4 walks them to the fix in *their* code — which only works if the
   reference is right. `pnpm test` checks this.

No rung may ever emit a runnable solution line. That is asserted in the backend tests, not
trusted.

---

## 7. Traps

1. **Import, then pin.** §5. It has bitten us three times.
2. **The JSON is not what renders.** The page reads `generated_missions.content`. Editing a
   file changes nothing until `mission:import` runs.
3. **Never key content by mission id.** The pool can hold more than one row per lesson and
   the claim service picks. Key by lesson, or by concept+stop.
4. **`client/src/lib/ai/types.ts` is generated** from the service's OpenAPI. Never hand-edit.
   `press` and `steps` are read through casts because of this — `docs/14` step 4.
5. **The runner accepts a bare name or a plain call.** `sign` works; `obj.attr` does not.
6. **No functions before the functions lesson.** Tested.
7. **Only what a phase is waiting on takes clicks.** The scene sits in a
   `pointer-events: none` layer so the panel can float over it; `.bakery-pick` opts back in.
8. **Rewind the beat index with the clock** when a second sequence starts in one phase.
9. **Never run `next build` while `next dev` is running** — they share `.next` and the dev
   server ends up serving a stale tree. An hour was lost to this.
10. **Every new simulation phase needs copy** in `bakery-world-demo.tsx`'s
    `Record<Phase, string>`, or the build breaks. It is live on the landing page.
11. **Anger is a product decision.** `el_forn.yaml` says `puzzled`/`pleased`, never anger.
    The impatient frames are used as *impatience* — «بسرعة عشان مستعجلة» is about her
    morning, not about the child. If that changes, change the manifest to match.

---

## 8. Where the code is

| what | where |
| --- | --- |
| the scene | `client/src/components/bakery/scene.tsx` |
| where everything stands | `client/src/lib/bakery/scene-manifest.ts` |
| the bakery state machine | `client/src/lib/bakery/simulation.ts` |
| mission → scene mapping, `beatsOf`, `pressTarget` | `client/src/lib/bakery/mission-scene.ts` |
| the beat timeline + in-scene speech | `client/src/components/mission-player/mission-scene.tsx` |
| phases, hints, runs | `client/src/components/mission-player/mission-player.tsx` |
| mission validator | `client/src/lib/bakery/first-mission.test.ts` |
| the missions | `ai-backend/content/prebuilt/*.json` |
| world vocabulary (the fence for generation) | `ai-backend/content/worlds/el_forn.yaml` |

The opening tour — same engine, no code step — is `client/src/lib/bakery/world-tour.ts`
played by `client/src/components/bakery/script-player.tsx`.

---

## 9. Definition of done, per mission

- [ ] three beats the child acts on, escalating
- [ ] opens where the previous mission ended, and says so
- [ ] a customer who is not Mariam, walking in before anyone discusses her
- [ ] at least one object that has never carried a mission before
- [ ] something the child writes is **not** a plain number
- [ ] `hintAr` on every guided step
- [ ] a wrong run has a consequence in the shop
- [ ] `pnpm test` green — the validator checks concept scope, blanks, tests, sequences
- [ ] imported, **then** pinned
- [ ] played start to finish in a browser before it is called done

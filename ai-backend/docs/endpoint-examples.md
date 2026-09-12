# Endpoints — what you send, what you get

Every request and response below was captured from the running service against the real
database, not written by hand. Re-capture after any contract change.

Base URL: `https://54-75-53-43.sslip.io` · Swagger: `/docs`

**Three rules that apply to everything:**

1. Every success is wrapped: `{"data": {...}, "meta": {...}}`. The first example shows the
   wrapper in full; after that only the `data` half is shown, because that is what
   `aiClient` hands back after unwrapping. The exception is `/v1/tico/messages`, which
   streams and is never wrapped.
2. Field names are **camelCase**.
3. Send `Authorization: Bearer <token>` on everything except `/v1/health`. The token is the
   Better Auth session token the Next.js app already holds; this service looks it up in the
   shared database. It never issues credentials.

**Nothing here is a stub any more.** All fifteen endpoints run real logic against Postgres,
and `meta.stub` is `false` everywhere.

Three of them call Gemini and take **20–30 seconds**: `/v1/missions/next`,
`/v1/missions/generate` and `/v1/challenges/next`. Show a progress state, and do not put
them behind a short client timeout.

---

## 1. `GET /v1/health`

Is the service up, and can it reach the database.

**Send:** nothing. No auth required.

**Get:**
```json
{
  "data": {
    "status": "ok",
    "environment": "production",
    "database": "ok",
    "version": "0.1.0"
  },
  "meta": {
    "request_id": "3da28af9-79b0-4695-a21e-4f6e6235d5c2",
    "stub": false,
    "cached": false
  }
}
```

`database` is `"ok"` or `"unreachable"`.

---

## 2. `POST /v1/sessions`

**Open this first.** Every other endpoint hangs off the session id it returns — hints,
submissions, chat, the debrief — and they all 404 without one. It is also the LangGraph
thread id for TICO's conversation, so keep it for the whole mission rather than making a new
one per request.

**Send:**
```json
{ "levelId": "cmtr2mjrn000auejsbj1s5h7w" }
```

| Field | Required | Notes |
| --- | --- | --- |
| `levelId` | **yes** | The lesson the student picked |
| `generatedMissionId` | no | Set it when the mission came from `/v1/missions/next`. Without it the debrief cannot tell which concept was practised, so mastery does not move |

**Get:** `201`
```json
{
  "id": "cmtut4c2oioyz0cpw7ryehcre",
  "userId": "doc-792caea017",
  "levelId": null,
  "generatedMissionId": null,
  "phase": "ENCOUNTER",
  "outcome": "IN_PROGRESS",
  "hintsUsed": 0,
  "timeSpentMs": 0,
  "startedAt": "2026-09-10T00:46:38.389000",
  "endedAt": null
}
```

> ⚠️ **`levelId` comes back `null`.** `practice_sessions` has no lesson column — it links to
> an exercise or a generated mission, and only the exercise carries a lesson. Send `levelId`
> on create; do not rely on reading it back. Closing that gap needs `lesson_id` on
> `practice_sessions`, which is a Prisma migration.

---

## 3. `PATCH /v1/sessions/{sessionId}/phase`

Record where the student is in the six-phase loop. The client drives the loop; this records
it.

It matters to `/v1/hints`, which rations help differently per phase: `GUIDED_CODING` starts
at rung 1, `ADAPT_REMIX` starts at rung 2, and phases 1–4 have no ladder at all.

**Send:**
```json
{ "phase": "GUIDED_CODING" }
```

`ENCOUNTER` · `EXPLORE` · `DISCOVER` · `UNDERSTAND` · `GUIDED_CODING` · `ADAPT_REMIX`

**Get:** the full session, with `phase` updated.

---

## 4. `POST /v1/hints`

Ask TICO for one hint. **The rung is decided by the server** from how many hints this session
has already had — you never ask for a level, and you cannot skip ahead.

**Send:**
```json
{
  "sessionId": "cmtusqkbtz2s40a306kf0dv2y",
  "missionId": "exercise-forn-01",
  "codeExcerpt": "loaves = trays * ___",
  "phase": "GUIDED_CODING",
  "guidedStep": 0,
  "lastResult": "FAILED"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `sessionId` | **yes** | The rung counter is per session, counted from `hint_events` |
| `missionId` | **yes** | Keys the hint cache |
| `codeExcerpt` | **yes** | The student's current code. Max 20,000 chars |
| `phase` | no | Decides the starting rung. Defaults to `GUIDED_CODING` |
| `guidedStep` | no | Which blank they are on |
| `lastResult` | no | `PASSED` · `FAILED` · `ERROR` · `TIMEOUT` |
| `errorText` | no | The actual failing message. Sharpens the hint |
| `errorTag` | no | From `/submissions/analyze`, e.g. `"assignment_vs_comparison"` |

**Get:**
```json
{
  "rung": 1,
  "hint": "يا بطل، بص كويس على الحتة الفاضية بعد علامة الـ `*` وشوف إحنا محتاجين نضرب `trays` في إيه عشان نطلع الـ `loaves`. كمل كده، أنت قدها!",
  "isFinal": false,
  "nextStep": null,
  "remainingRungs": 3,
  "hintEventId": "cmtusqm77z2s90a30b6sa7l5s",
  "cached": false
}
```

| Rung | Gives |
| --- | --- |
| 1 | Points at the region. Names nothing |
| 2 | Names the concept |
| 3 | Walks the logic in words |
| 4 | `isFinal: true`, and `nextStep` is one concrete action — **never the answer** |

Two guards run over every reply before it is returned: one rejects a hint containing a
runnable line of Python, the other rejects one that fills in the blank. A rejected hint is
replaced with authored text, so **a student always gets something**. `cached: true` means no
model was called.

---

## 5. `POST /v1/submissions/analyze`

Classify a failure. Call it after a failed run and before asking for a hint — the `errorTag`
it returns makes the next hint much sharper.

**Send:**
```json
{
  "sessionId": "cmtusykjlyrc50280d3jdbvqc",
  "attemptNumber": 2,
  "code": "waiting = station_queue\nif waiting = 30:\n    open_gate()",
  "errorText": "SyntaxError: invalid syntax. Maybe you meant '==' instead of '='?"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `sessionId` | **yes** | |
| `code` | **yes** | Max 20,000 chars |
| `attemptNumber` | no | Defaults 1. Real evidence — the same error on attempt 7 means something different from attempt 1 |
| `submissionId` | no | Pass it and the diagnosis is written onto that `submissions` row |
| `errorText` | no | Max 8,000 chars |
| `expectedOutput` / `actualOutput` | no | Max 4,000 each |

There is no `lastResult` field here. Sending one is a `422`.

**Get:**
```json
{
  "errorFamily": "LOGIC",
  "errorTag": "assignment_vs_comparison",
  "misconception": "Used a single equals sign (=) for assignment where a double equals (==) comparison was intended.",
  "confidence": 0.95,
  "isNewTag": false,
  "escalated": false,
  "inScaffoldedRegion": false
}
```

`errorFamily` is closed: `SYNTAX` · `NAME` · `TYPE` · `LOGIC` · `INCOMPLETE` · `RUNTIME` ·
`UNKNOWN`. `errorTag` is **open** — the vocabulary is read from the database before each call
and written back after, so it grows out of real students. `isNewTag: true` means this student
produced a mistake nobody had recorded before.

`inScaffoldedRegion: true` means the error is in code the scaffold gave them, not code they
wrote — do not blame them for it.

---

## 6. `POST /v1/sessions/{sessionId}/close`

Records the outcome and elapsed time, and **moves the student's concept mastery** on the
evidence this session produced.

**Send:**
```json
{ "outcome": "SOLVED", "timeSpentMs": 412000 }
```

`SOLVED` · `ABANDONED` · `TIMEOUT` · `IN_PROGRESS`

**Get:** the full session, with `outcome`, `timeSpentMs` and `endedAt` set.

**Idempotent.** Closing twice keeps the first `endedAt` and applies the mastery evidence once
— you may legitimately fire on both "tests passed" and "student navigated away".

Mastery moves *here*, not on debrief, because the debrief is a screen a student may never
open, or may open twice.

---

## 7. `POST /v1/sessions/{sessionId}/debrief`

The results screen.

**Send:** nothing.

**Get:**
```json
{
  "sessionId": "cmtusqkbtz2s40a306kf0dv2y",
  "outcome": "SOLVED",
  "totalAttempts": 3,
  "hintsUsed": 1,
  "errorsOvercome": ["assignment_vs_comparison"],
  "timeSpentMs": 412000,
  "conceptsMastered": [],
  "masteryDelta": {},
  "ticoFeedback": "عجبتني شطارتك لما ميزت بين علامة التساوي الواحدة والاتنين!",
  "starsEarned": 2
}
```

**Every number here is counted in Python** from `submissions` and `hint_events`. The model
writes one field, `ticoFeedback`, and a reply containing a figure the counts do not support
is thrown away — "you did it first try" in front of a child who took nine attempts proves
nobody was watching.

`errorsOvercome` is the interesting one: tags that appeared on some attempt and were gone by
the last one. That is the thing a student can feel proud of.

`conceptsMastered` lists a concept only if **this** session pushed it over the line, and
never on a single piece of evidence.

---

## 8. `POST /v1/students/{studentId}/refresh`

Recompute the student model and decide whether the concept gate opens. Fire and forget in
the background after a session closes.

**Send:**
```json
{ "sessionId": "cmtusqkbtz2s40a306kf0dv2y" }
```

**Get:**
```json
{
  "profile": {
    "userId": "doc-586fbbcd33",
    "selfReportedLevel": null,
    "skillBand": "ON_LEVEL",
    "hintDependency": 0.0,
    "syntaxVsLogic": 0.5,
    "pace": null,
    "locale": "ar-EG",
    "ageBand": null,
    "learnerPreference": null,
    "gender": null,
    "onboardingCompletedAt": null,
    "lastComputedAt": null,
    "modelVersion": null
  },
  "concepts": [],
  "advanced": false,
  "decidedBy": "RULE",
  "reason": "That session has no target concept, so there is no gate to evaluate.",
  "summary": null
}
```

Mastery has **already moved** by the time this runs — `close` did that. What this decides is
the separate question of whether the student advances or does another rep.

`decidedBy` is `RULE` or `MODEL`. A rule proposes; a model reviews **only** when the evidence
conflicts — solved it but leaned on every hint, or failed but was fast and clean. Clear-cut
cases never reach a model, and `reason` always says why.

A session opened without `generatedMissionId` has no target concept, so there is no gate to
evaluate. That is the `reason` shown above, not an error.

---

## 9. `POST /v1/students/{studentId}/plan`

Build the personal path through the fixed lesson order. Call once, after onboarding.

**Send:**
```json
{ "isBeginner": true }
```

| Field | Required | Notes |
| --- | --- | --- |
| `isBeginner` | **yes** | `true` short-circuits everything: all lessons required, no diagnostic, no model call |
| `diagnosticSessionId` | no | The diagnostic playthrough |
| `selfReportedLevel` | no | |

**Get:**
```json
{
  "lessons": [
    {
      "levelId": "cmtr2mjrn000auejsbj1s5h7w",
      "requirement": "REQUIRED",
      "reason": null,
      "decidedBy": "RULE",
      "confidence": 1.0,
      "decidedAt": null
    }
  ],
  "startingLevelId": "cmtr2mjrn000auejsbj1s5h7w",
  "skippedCount": 0,
  "summary": "أهلاً! هنبدأ من أول درس ونمشي خطوة خطوة."
}
```

**The concept order never changes. Which lessons are in the path does.** An `OPTIONAL` lesson
stays in the path, in order, and stays playable — skipping is a suggestion, never a lock-out,
because the whole decision rests on one diagnostic playthrough.

Every proposed skip is model-reviewed, and **the reviewer may only refuse a skip, never
invent one**. A needless lesson costs ten minutes of boredom; a wrongly skipped one leaves a
hole the student hits six lessons later with no idea why.

Returns `409` when the `lessons` table is empty.

---

## 10. `POST /v1/missions/next`

Generate the mission this student should play now, as **six phases**. Gemini writes it and a
Python validator runs the code before it is returned.

⏱ **20–30 seconds.**

**Send:**
```json
{ "lessonId": "cmtr2mjrn000auejsbj1s5h7w" }
```

| Field | Required | Notes |
| --- | --- | --- |
| `lessonId` | no | An explicit choice outranks mastery. Without it the server picks the first concept they have not mastered |
| `forceRegenerate` | no | Skip the reuse check |

**Get:**
```json
{
  "id": "cmtut8xk1a3b70cpw9wm2qxyz",
  "worldId": "el_forn",
  "sceneId": "bakery_gameplay",
  "targetConceptId": "variables",
  "carriedConceptIds": [],
  "titleAr": "حساب عيش الفرن البلدي",
  "source": "model",
  "validated": true,
  "difficultyBand": 5,
  "scaffold": {},
  "phases": {
    "encounter": {
      "speaker": "hassan",
      "speakerNameAr": "الأسطى حسن",
      "lineAr": "يا سلمى، الصواني داخلة الفرن وورايا زحمة زباين! كل صينية بنرص فيها بالظبط 12 رغيف.",
      "ctaAr": "يلا نبدأ",
      "world": { "props": { "tray": 4, "loaf": 12 } }
    },
    "explore": {
      "ticoIntroAr": "يا هلا بيك في الفرن البلدي!",
      "rounds": [
        {
          "questionAr": "لو عندنا صينية واحدة طالعة من الفرن، تفتكر هيكون عليها كام رغيف عيش؟",
          "optionsAr": ["12 رغيف", "24 رغيف", "6 أرغفة"],
          "correctIndex": 0,
          "nudgeAr": "بص على الصينية كدة، الأسطى حسن قال إن الصينية الواحدة بتشيل كام."
        }
      ]
    },
    "discover": {
      "conceptSlug": "variables",
      "conceptNameAr": "المتغيرات (Variables)",
      "explanationAr": "المتغير في البرمجة زي علبة بنحفظ فيها قيمة أو رقم عشان نستخدمه وننادي عليه باسمه بعدين.",
      "ticoLineAr": "برافو عليك! كده نقدر نعمل علبة نسميها loaves_per_tray ونشيل جواها رقم 12."
    },
    "understand": {
      "introAr": "بص كدة الكود ده في بايثون بيعمل إيه.",
      "code": "def calculate_loaves(trays: int) -> int:\n    loaves_per_tray = 12\n    loaves = trays * loaves_per_tray\n    return loaves",
      "annotations": [{ "line": 2, "textAr": "هنا عملنا متغير." }]
    },
    "guided": {
      "steps": [
        {
          "code": "def calculate_loaves(trays: int) -> int:\n    loaves_per_tray = ___\n    loaves = trays * loaves_per_tray\n    return loaves",
          "blanks": ["12"],
          "promptAr": "اكتب عدد الأرغفة اللي بتشيلها الصينية الواحدة جوه المتغير",
          "hintAr": "الأسطى حسن قال إن الصينية الواحدة بنرص عليها 12 رغيف."
        }
      ],
      "solutionCode": "def calculate_loaves(trays: int) -> int:\n    loaves_per_tray = 12\n    loaves = trays * loaves_per_tray\n    return loaves",
      "tests": [{ "call": "calculate_loaves(3)", "expected": "36" }],
      "onRun": { "animate": "loaves_appear" }
    },
    "remix": {
      "twistAr": "الفرن كبر وجبنا صواني أوسع بتشيل 20 رغيف في الصينية الواحدة!",
      "newRequirementAr": "عدل الكود عشان المتغير loaves_per_tray يشيل القيمة الجديدة.",
      "worldChange": { "animate": "loaves_appear", "props": { "tray": 2, "loaf": 12 } },
      "startingCode": "def calculate_loaves(trays: int) -> int:\n    loaves_per_tray = 12\n    loaves = trays * loaves_per_tray\n    return loaves"
    }
  }
}
```

The six phases are always all present. `source` is `"model"`. `solutionCode` is used to check
their attempt and is **never shown**.

`validated: true` means a Python validator **ran the code**: the solution passes its tests,
each guided step genuinely fails until its blank is filled, and the remix twist really does
break the phase-5 solution. An unvalidated mission is never returned, so you never have to
defend against an unsolvable one.

**Pass the returned `id` as `generatedMissionId`** when you open the session, or mastery
cannot move.

Returns **503** when generation cannot produce something playable — say so rather than
showing a broken mission. A child cannot tell the difference and will blame themselves.

---

## 11. `POST /v1/missions/by-lesson`

The mission behind **one stop on the map**. `/missions/next` answers "what should this
student play now" from mastery; this answers "what is behind stop 3 of the bakery", which is
what a student clicking a node is actually asking — and what the Next.js client used to
answer for itself by reading `generated_missions` directly.

⏱ **~1 second** on the default setting. 20–30 seconds when generation is live.

**Send:**
```json
{ "worldSlug": "el-forn", "lessonNumber": 2 }
```

| Field | Required | Notes |
| --- | --- | --- |
| `worldSlug` | **yes** | The world's `tracks.slug` |
| `lessonNumber` | one of the two | The stop's **position**, 1-based, counting the way the map draws them |
| `lessonSlug` | one of the two | The lesson's own slug. Wins when both are sent |
| `forceRegenerate` | no | Compose a fresh mission for this one call, whatever the service is configured to do |

`lessonNumber` is a position, **not `lessons.order`**. El-forn's orders run 1, 2, 4, 5 —
lesson 3 was never written — and the map draws four stops, so stop 3 is `fair-share` and
stop 4 is `morning-batches`. The map is what the student can see, so the map wins.

**Get:** the same mission shape as `/v1/missions/next`, plus six fields saying how it got
here.

```json
{
  "id": "cmtwkm8raqt5d01z04ksf3jl8",
  "worldId": "el_forn",
  "sceneId": "bakery_gameplay",
  "targetConceptId": "variables",
  "carriedConceptIds": [],
  "titleAr": "حساب طابور العيش",
  "source": "model",
  "validated": true,
  "scaffold": {},
  "difficultyBand": 5,
  "lessonId": "cmtr2mkve000cuejsso9qvsj1",
  "lessonSlug": "count-the-trays",
  "lessonNumber": 2,
  "worldSlug": "el-forn",
  "stop": 2,
  "delivery": "prebuilt",
  "live": false,
  "phases": { "encounter": "…", "explore": "…", "discover": "…", "understand": "…", "guided": "…", "remix": "…" }
}
```

`stop` is which of the *concept's* stops this lesson is. A concept is taught over several
lessons — `opening-message` and `count-the-trays` both teach `variables` — and each gets its
own scenario, so stop is what distinguishes them. Stops 1 and 2 above are two different
missions about the same idea, not the same mission twice.

### Where the mission comes from

One setting, `LIVE_MISSION_GENERATION`, decides:

| Setting | `delivery` | `live` | What happened |
| --- | --- | --- | --- |
| off (default) | `prebuilt` | `false` | The prepared mission for this stop. One query, no model call |
| off, nothing prepared | `reused` | `false` | An unplayed validated row from the pool |
| off, nothing prepared or spare | `generated` | `false` | Composed on this request |
| on, or `forceRegenerate` | `generated` | `true` | Gemini wrote it just now; the validator ran its code |

**The mission is identical in shape either way** — both went through the same validator — so
nothing downstream has to branch on this. `delivery` and `live` exist so a caller never has
to guess whether it is looking at prepared content or something that did not exist a minute
ago.

The default is the demo setting on purpose: the prepared set is the same scenario every
time, which is what lets narration be recorded against it. Turn the flag on to show the
generator is real.

Returns **404** for an unknown world or a stop that world does not have
(`"world 'el-forn' has 4 lessons; there is no stop 5"`), and **503** when generation was the
only option left and could not produce something playable.

---

## 12. `GET /v1/missions/{missionId}`

All six phases of a mission you already have the id of — a student reloading the player, or
coming back tomorrow to the mission in their address bar. No model call, no generation: this
only reads.

**Send:** nothing but the id in the path.

**Get:** exactly the `/v1/missions/next` body — same fields, no extras.

```json
{
  "id": "cmtwklihyqt4p01z00z8ue6zx",
  "worldId": "el_forn",
  "sceneId": "bakery_gameplay",
  "targetConceptId": "variables",
  "titleAr": "حسبة الدقيق السريعة",
  "source": "model",
  "validated": true,
  "phases": { "encounter": "…", "explore": "…", "discover": "…", "understand": "…", "guided": "…", "remix": "…" }
}
```

**404 covers three different things and does not distinguish between them**, because none of
them is something a student should be looking at, and telling an attacker apart from a typo is
not worth confirming a row exists:

- no such mission;
- a mission the validator never passed — it may be unsolvable;
- a mission claimed by a different student. Prepared missions are shared content and stay
  readable by everyone.

---

## 13. `POST /v1/missions/generate`

Build a mission when you already know what you want — for authoring, and for pre-warming a
lesson before a class. `/missions/next` **decides**; this one **builds**.

⏱ **20–30 seconds.**

**Send:** every field is optional.
```json
{ "lessonId": "cmtr2mjrn000auejsbj1s5h7w" }
```

| Field | Notes |
| --- | --- |
| `lessonId` | |
| `concept` | Concept slug, e.g. `"loops"` |
| `scaffoldLevel` | **Teachers only.** Ignored for a student — one who could set their own scaffold could ask for none and be handed a blank file |
| `locale` | Defaults `"ar-EG"` |

**Get:**
```json
{
  "missionId": "cmtut9p2mb4c80cpwa1n3rabc",
  "title": "حسبة العيش على الطبلية",
  "instructions": "يا سلمى، الصواني داخلة الفرن وورايا زحمة زباين!",
  "starterCode": "def bake_loaves(trays: int) -> int:\n    ___ = 12\n    loaves = trays * loaves_per_tray\n    return loaves",
  "testCases": [
    { "input": "bake_loaves(3)", "expectedOutput": "36", "isHidden": false },
    { "input": "bake_loaves(1)", "expectedOutput": "12", "isHidden": false }
  ],
  "hints": ["...", "...", "...", "..."],
  "concepts": { "primary": "variables", "carried": [] },
  "scaffoldPlan": {},
  "validated": true,
  "engineVersion": "gen/v2-phases"
}
```

**This shape is lossy on purpose.** A six-phase mission is a journey and an `exercises` row
has nowhere to put one, so what you get back is the guided phase: `starterCode` is the first
guided step's code, blanks and all, and `testCases` are its tests. Call `/v1/missions/next`
for the whole thing.

`hints` are the four authored fallbacks, one per rung — served when the model is unavailable
or a guard rejects what it wrote.

---

## 14. `POST /v1/challenges/next`

The arena, for students who finished the roadmap. Six phases like any other mission, but
**no scaffolding** and a shorter hint ladder.

⏱ **20–30 seconds.**

**Send:**
```json
{}
```

| Field | Notes |
| --- | --- |
| `worldSlug` | Restrict to one world. Omit to mix across everything unlocked |
| `excludeLevelIds` | Recently played, to avoid repeats |

**Get:** the same `PhasedMissionOut` as `/v1/missions/next`.

Concepts are mixed and weighted toward the **weakest mastered** one — a challenge built from
what a student is best at flatters them and teaches nothing. Only concepts at or above the
mastery threshold are eligible, so a challenge never surprises anyone with something they
were never taught.

**Get (not ready):** `409`
```json
{
  "error": {
    "code": "conflict",
    "message": "Not ready for the arena yet. Insufficient mastered concepts for arena challenge: required 2, but learner only has 0 concept(s) at or above mastery threshold 0.70. Eligible: [].",
    "request_id": "27cbab37-78d0-46aa-b7d7-f7d9b8ab186e",
    "retryable": false,
    "details": {}
  }
}
```

`409` is not a failure. Nothing is broken — the student belongs on the roadmap for now, and
two mastered concepts are the minimum needed to mix anything worth calling a challenge.

---

## 15. `POST /v1/tico/messages`

Chat. **Server-sent events, not JSON** — this is the one endpoint with no envelope.

**Send:**
```json
{
  "sessionId": "cmtusykjlyrc50280d3jdbvqc",
  "message": "ليه الكود بتاعي مش شغال؟"
}
```

**Get:** `Content-Type: text/event-stream`
```
data: {"delta": "يا هلا يا بطل! ولا يهمك،", "done": false, "blocked": false, "offeredHintRung": null}

data: {"delta": " مفيش كود بيمشي صح من أول مرة، وده حلاوة البرمجة! 😉", "done": false, "blocked": false, "offeredHintRung": null}

data: {"delta": "", "done": true, "blocked": false, "offeredHintRung": null}
```

| Field | Means |
| --- | --- |
| `delta` | The next chunk. Append it |
| `done` | `true` on the last frame |
| `blocked` | Moderation stopped the message. The reply redirects gently |
| `offeredHintRung` | TICO declined to give the answer and offered a hint instead |

Use `aiClient.streamTicoMessage()`, which returns the raw `Response` — **not** `fetchAi`,
which would try to parse it as JSON.

Real frames, not yet real tokens: the graph returns a finished string and the service chunks
it. The frame format will not change when it learns to stream properly.

---

## When something goes wrong

Every error looks like this:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request body did not match the contract.",
    "request_id": "96d9232d-477c-4e5c-b515-5c1f044752fa",
    "retryable": false,
    "details": {
      "fields": [
        { "type": "missing", "loc": ["body", "levelId"], "msg": "Field required", "input": {} }
      ]
    }
  }
}
```

| Status | `code` | Usually |
| --- | --- | --- |
| 401 | `unauthenticated` | No token, or the session expired |
| 403 | `forbidden` | Valid token, but you asked for another student's data |
| 404 | `not_found` | No such session **for this student** — see below |
| 409 | `conflict` | Not ready for the arena, or no lessons to plan |
| 422 | `validation_error` | Read `details.fields` — it names the field |
| 429 | `rate_limited` | Daily model-call cap. `retryable: true`, so back off |
| 503 | `service_unavailable` | Generation could not produce something playable |

**404, not 403, for someone else's session.** Asking for a session you do not own gives:

```json
{
  "error": {
    "code": "not_found",
    "message": "no session 'does-not-exist' for this student",
    "request_id": "14a723ec-903a-481a-9759-45c9dfe98863",
    "retryable": false,
    "details": {}
  }
}
```

Deliberate: confirming that another child's session id exists is not worth being able to tell
an attacker apart from a typo. A `403` is reserved for `/v1/students/{id}/...`, where the id
in the path is already known to the caller:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You can only access your own progress.",
    "request_id": "339fba48-2da9-4cb9-98af-70538e7b6a93",
    "retryable": false,
    "details": {}
  }
}
```

Only retry when `retryable` is `true`. Quote `request_id` in a bug report and the exact
server log line can be found.

---

## The order to call things in

```
POST   /v1/missions/next              20-30s, returns generatedMissionId
POST   /v1/sessions                   pass that id, or mastery cannot move
PATCH  /v1/sessions/{id}/phase        once per phase
  POST /v1/submissions/analyze        after a failed run
  POST /v1/hints                      rung counted server-side
  POST /v1/tico/messages              SSE, any time
POST   /v1/sessions/{id}/close        mastery moves here
POST   /v1/sessions/{id}/debrief      the results screen
POST   /v1/students/{id}/refresh      background, fire and forget
```

`/v1/students/{id}/plan` is called once after onboarding, and `/v1/challenges/next` replaces
`/v1/missions/next` once the roadmap is finished.

# Endpoints — what you send, what you get

Every request and response below was captured from the running service, not written by
hand.

Base URL: `https://54-75-53-43.sslip.io` · Swagger: `/docs`

**Two rules that apply to everything:**

1. Every success is wrapped: `{"data": {...}, "meta": {...}}`. The first example shows the
   wrapper in full; after that only the `data` half is shown, because that is what
   `aiClient` hands back after unwrapping.
2. Field names are **camelCase**.

---

## 1. `GET /v1/health`

Is the service up, and can it reach the database.

**Send:** nothing.

**Get:**
```json
{
  "data": {
    "status": "ok",
    "environment": "production",
    "database": "ok"
  },
  "meta": {
    "request_id": "7e862677-fd92-453e-b051-c881e54d8bfd",
    "stub": false,
    "cached": false
  }
}
```

`database` is `"ok"` or `"unreachable"`. This is the only endpoint that is not a stub.

---

## 2. `POST /v1/hints`

Ask TICO for one hint. The rung is decided by the server from how many hints this session
has already had — you never ask for a level.

**Send:**
```json
{
  "sessionId": "sess-abc",
  "missionId": "demo-exercise-conditional-gate",
  "codeExcerpt": "if station.passengers = 30:\n    gate.open()",
  "lastResult": "ERROR",
  "locale": "ar-EG"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `sessionId` | **yes** | The rung counter is per session |
| `missionId` | **yes** | The exercise id. Keys the hint cache |
| `codeExcerpt` | **yes** | The student's current code. Max 20,000 chars |
| `lastResult` | no | `PASSED` · `FAILED` · `ERROR` · `TIMEOUT` · `null` |
| `locale` | no | Defaults `"ar-EG"` |
| `errorText` | no | The actual failing message. Sharpens the hint |
| `errorTag` | no | From `/submissions/analyze`, e.g. `"assignment_vs_comparison"` |

**Get:**
```json
{
  "rung": 1,
  "hint": "البوابة مش بتفتح خالص. بصّ كويس على السطر اللي بتتحقق فيه من عدد الركاب.",
  "isFinal": false,
  "nextStep": null,
  "hintEventId": "demo-hint-sess-abc-1",
  "cached": false
}
```

**Call it again with the same `sessionId` and the rung climbs:**

| Call | `rung` | `isFinal` | `nextStep` |
| --- | --- | --- | --- |
| 1st | 1 | `false` | `null` |
| 2nd | 2 | `false` | `null` |
| 3rd | 3 | `false` | `null` |
| 4th | 4 | `true` | `"mini_practice"` |
| 5th+ | 4 | `true` | `"mini_practice"` |

It stops at 4. When `isFinal` is true, show a smaller practice exercise — **no rung ever
returns the answer.**

---

## 3. `POST /v1/submissions/analyze`

Classify why a submission failed.

**Send:**
```json
{
  "sessionId": "sess-abc",
  "attemptNumber": 2,
  "code": "if station.passengers = 30:\n    gate.open()",
  "errorText": "SyntaxError: invalid syntax"
}
```

`sessionId` and `code` are required. `attemptNumber` defaults to 1. Also optional:
`submissionId`, `expectedOutput`, `actualOutput`.

**Get:**
```json
{
  "errorFamily": "LOGIC",
  "errorTag": "assignment_vs_comparison",
  "misconception": "The student believes a single `=` compares two values.",
  "confidence": 0.93,
  "isNewTag": false,
  "escalated": false,
  "inScaffoldedRegion": false
}
```

| Field | Meaning |
| --- | --- |
| `errorFamily` | Fixed set of 7: `SYNTAX` `NAME` `TYPE` `LOGIC` `INCOMPLETE` `RUNTIME` `UNKNOWN`. Same values as the database column |
| `errorTag` | Open-ended snake_case tag. New ones get coined as students hit new mistakes |
| `misconception` | What the student appears to believe. Feeds the hint |
| `isNewTag` | `true` when this tag has not been seen before |
| `inScaffoldedRegion` | The error is in code we pre-filled — do not blame the student |

Unrecognised code returns `errorFamily: "UNKNOWN"`, `isNewTag: true`.

---

## 4. `POST /v1/sessions`

Open a session when a student starts a mission.

**Send:**
```json
{ "levelId": "demo-exercise-conditional-gate" }
```

Optional: `"kind"` — `LESSON` (default) · `DIAGNOSTIC` · `CHALLENGE`.

**Get — note this returns `201`, not `200`:**
```json
{
  "id": "demo-session-1",
  "userId": "demo-student-1",
  "levelId": "demo-exercise-conditional-gate",
  "generatedMissionId": null,
  "phase": "ENCOUNTER",
  "outcome": "IN_PROGRESS",
  "hintsUsed": 0,
  "timeSpentMs": 0,
  "startedAt": "2026-09-06T16:09:54.684714Z",
  "endedAt": null
}
```

Keep the `id` — the next four endpoints need it.

---

## 5. `PATCH /v1/sessions/{sessionId}/phase`

Move the student through the seven-phase mission loop.

**Send:**
```json
{ "phase": "GUIDED_CODING" }
```

Valid: `ENCOUNTER` → `EXPLORE` → `DISCOVER` → `UNDERSTAND` → `GUIDED_CODING` →
`ADAPT_REMIX` → `INDEPENDENT`

**Get:** the whole session object again, with `phase` updated.

---

## 6. `POST /v1/sessions/{sessionId}/close`

**Send:**
```json
{ "outcome": "SOLVED", "timeSpentMs": 254000 }
```

`outcome`: `SOLVED` · `ABANDONED` · `TIMED_OUT`

**Get:** the session, with `outcome` set and `endedAt` filled in:
```json
{
  "id": "demo-session-1",
  "phase": "GUIDED_CODING",
  "outcome": "SOLVED",
  "hintsUsed": 2,
  "timeSpentMs": 254000,
  "startedAt": "2026-09-06T16:09:54.684714Z",
  "endedAt": "2026-09-06T16:14:54.684714Z"
}
```

---

## 7. `POST /v1/sessions/{sessionId}/debrief`

The end-of-mission results screen.

**Send:** nothing (empty body `{}`).

**Get:**
```json
{
  "sessionId": "demo-session-1",
  "outcome": "SOLVED",
  "totalAttempts": 4,
  "hintsUsed": 2,
  "errorsOvercome": ["assignment_vs_comparison", "missing_colon"],
  "timeSpentMs": 412000,
  "conceptsMastered": ["conditionals"],
  "ticoFeedback": "برافو! غلطت في = و == مرتين وبعدين مسكتها لوحدك. دي بالظبط الحاجة اللي بتفرق بين اللي بيحفظ واللي بيفهم.",
  "starsEarned": 3
}
```

`errorsOvercome` is the interesting one — mistakes that appeared and then stopped. That is
the thing a student can feel proud of. `starsEarned` is 0–3.

---

## 8. `POST /v1/students/{studentId}/refresh`

Recompute what we know about a student. Call it in the background after a session closes.

**Send:**
```json
{ "watermark": "submission-abc-123" }
```

`watermark` is the newest submission id you have already accounted for. Optional, but
without it a double-call counts the same attempts into mastery twice.

**Get:**
```json
{
  "profile": {
    "userId": "demo-student-1",
    "selfReportedLevel": "beginner",
    "skillBand": "ON_LEVEL",
    "hintDependency": 0.38,
    "syntaxVsLogic": 0.62,
    "pace": 1.1,
    "locale": "ar-EG",
    "lastComputedAt": "2026-09-06T16:14:54.684714Z"
  },
  "concepts": [
    { "conceptId": "variables",    "mastery": 0.82, "confidence": 0.71, "evidenceCount": 9 },
    { "conceptId": "conditionals", "mastery": 0.41, "confidence": 0.48, "evidenceCount": 4 },
    { "conceptId": "loops",        "mastery": 0.0,  "confidence": 0.0,  "evidenceCount": 0 },
    { "conceptId": "functions",    "mastery": 0.0,  "confidence": 0.0,  "evidenceCount": 0 }
  ],
  "advanced": false,
  "decidedBy": "MODEL",
  "reason": "Solved it, but used three of four hint rungs and took twice the expected time. Holding for one more rep rather than advancing."
}
```

| Field | Meaning |
| --- | --- |
| `skillBand` | `STRUGGLING` · `ON_LEVEL` · `READY_TO_STRETCH` |
| `hintDependency` | 0–1. How much they lean on hints |
| `syntaxVsLogic` | 0 = errors are mostly syntax, 1 = mostly logic |
| `mastery` / `confidence` | 0–1 per concept |
| `advanced` | Whether the student moved on to the next concept |
| `decidedBy` | `RULE` or `MODEL` — who made the call |
| `reason` | Always present. This is what you show a teacher |

---

## 9. `POST /v1/students/{studentId}/plan`

Build the student's personal path through the fixed lesson order.

**Send:**
```json
{ "isBeginner": false, "diagnosticSessionId": "d1" }
```

**Get:**
```json
{
  "lessons": [
    {
      "levelId": "demo-lesson-1",
      "requirement": "OPTIONAL",
      "reason": "Solved the variables task in the diagnostic with no hints.",
      "decidedBy": "MODEL",
      "confidence": 0.79,
      "decidedAt": "2026-09-06T16:14:54.658602Z"
    },
    {
      "levelId": "demo-lesson-4",
      "requirement": "REQUIRED",
      "reason": null,
      "decidedBy": "RULE",
      "confidence": 1.0,
      "decidedAt": "2026-09-06T16:14:54.658602Z"
    }
  ],
  "skippedCount": 3
}
```

`requirement` is `REQUIRED` · `OPTIONAL` · `DONE` · `SKIPPED`.

The lesson **order never changes** — only which ones are required. Every `OPTIONAL` lesson
carries a `reason`, and stays in the list so the student can still play it. Skipping is a
suggestion, not a lock-out.

With `isBeginner: true` you get `skippedCount: 0` and everything `REQUIRED`.

---

## 10. `POST /v1/missions/next`

What should this student play now. The server picks the lesson and composes the scenario.

**Send:**
```json
{ "forceRegenerate": false }
```

All optional: `lessonId`, `worldManifestVersion`, `forceRegenerate`. **The student is not
a field** — it comes from the token.

**Get:**
```json
{
  "id": "demo-generated-1",
  "levelId": "demo-exercise-conditional-gate",
  "worldId": "cairo_metro",
  "sceneId": "platform_day",
  "targetConceptId": "conditionals",
  "carriedConceptIds": ["variables"],
  "brief": "الرصيف زحمة والقطر جاي. افتح البوابة التانية لو المستنيين أكتر من 30.",
  "starterCode": "# الرصيف زحمة...\nwaiting = station.passengers\n\n# TODO: افتح البوابة لما الشرط يتحقق\n",
  "tests": [
    { "name": "gate opens above the threshold",  "call": "gate.state", "expected": "open" },
    { "name": "gate stays shut below the threshold", "call": "gate.state", "expected": "closed" }
  ],
  "scaffoldPlan": {
    "scaffold": { "variables": "FULL" },
    "difficultyBand": 4,
    "repNumber": 1
  },
  "params": { "reading": "station.passengers", "threshold": 30, "comparison": ">" },
  "validated": true,
  "reused": false
}
```

| Field | Meaning |
| --- | --- |
| `targetConceptId` | What this mission teaches |
| `carriedConceptIds` | Concepts it also uses. Learning is cumulative |
| `sceneId` | Chosen from the world manifest. Never invented |
| `scaffoldPlan.scaffold` | Per concept: `NONE` · `PARTIAL` · `FULL`. `FULL` means it is pre-written because it is not the point of this lesson |
| `validated` | Checked by Python, not claimed by the model. **Never `false`** |
| `reused` | An equivalent mission already existed and was reused |

`forceRegenerate: true` changes `sceneId` and `params` but **not** `targetConceptId` or
`worldId` — the roadmap fixes those.

---

## 11. `POST /v1/missions/generate`

Build a mission when you already know what you want. Contrast with `/missions/next`, which
*decides* what is next.

**Send:**
```json
{ "concept": "conditionals" }
```

Everything is optional — `{}` works, and the server derives the rest. Also accepts
`lessonId`, `worldManifestVersion`, `scaffoldLevel`, `locale`.

**Get** — flatter than `/missions/next`, shaped like an `exercises` row:
```json
{
  "missionId": "demo-exercise-conditional-gate",
  "title": "البوابة الشرطية",
  "instructions": "الرصيف زحمة. افتح البوابة التانية لو عدد المستنيين أكتر من 30.",
  "starterCode": "# ...\nwaiting = station.passengers\n\n# TODO: ...\n",
  "testCases": [
    { "input": "gate.state", "expectedOutput": "open",   "isHidden": false },
    { "input": "gate.state", "expectedOutput": "closed", "isHidden": false }
  ],
  "hints": ["…rung 1…", "…rung 2…", "…rung 3…", "…rung 4…"],
  "concepts": { "primary": "conditionals", "carried": ["variables"] },
  "scaffoldPlan": { "scaffold": { "variables": "FULL" }, "difficultyBand": 4, "repNumber": 1 },
  "validated": true,
  "engineVersion": "stub-0"
}
```

`hints` is always **4 entries**, one per rung. These are the authored fallbacks used when
the model is unavailable or its output gets rejected.

---

## 12. `POST /v1/challenges/next`

The arena, for students who finished the roadmap.

**Send:**
```json
{ "excludeLevelIds": [] }
```

Optional: `worldSlug` to restrict to one world.

**Get:** the same shape as `/missions/next`, with two differences:

```json
{
  "id": "demo-challenge-1",
  "brief": "تحدي: افتح البوابة بس لو الرصيف زحمة والقطر جاي في نفس الوقت.",
  "carriedConceptIds": ["variables", "conditionals"],
  "scaffoldPlan": { "scaffold": {}, "difficultyBand": 7, "repNumber": 1 }
}
```

- `scaffold` is **empty** — no help
- `difficultyBand` is 6 or higher

A challenge should stretch, not flatter.

---

## 13. `POST /v1/tico/messages`

TICO's chat. **This one is different from all the others** — it streams Server-Sent
Events, and is not wrapped in `{data, meta}`.

**Send:**
```json
{ "sessionId": "sess-abc", "message": "ليه == ؟" }
```

**Get** — `Content-Type: text/event-stream`, arriving one line at a time:
```
data: {"delta": "سؤال حلو! ", "done": false, "blocked": false, "offeredHintRung": null}

data: {"delta": "في Python، الـ `=` الواحدة معناها ", "done": false, "blocked": false, "offeredHintRung": null}

data: {"delta": "", "done": true, "blocked": false, "offeredHintRung": null}
```

Append each `delta` as it arrives; stop when `done` is `true`.

| Field | Meaning |
| --- | --- |
| `delta` | The next piece of text. Empty on the final frame |
| `done` | `true` on the last frame |
| `blocked` | Moderation stopped the message. The reply redirects gently |
| `offeredHintRung` | TICO declined to give the answer and offered a hint instead |

In code use `aiClient.streamTicoMessage()`, which returns the raw `Response` — **not**
`fetchAi`, which would try to parse it as JSON.

---

## When something goes wrong

Every error looks like this:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request body did not match the contract.",
    "request_id": "ec2778c1-1056-44c9-a287-8425146ccdbc",
    "retryable": false,
    "details": {
      "fields": [
        { "loc": ["body", "missionId"], "msg": "Field required", "type": "missing" }
      ]
    }
  }
}
```

| Status | `code` | Usually |
| --- | --- | --- |
| 401 | `unauthenticated` | No token, or it expired (they last one hour) |
| 403 | `forbidden` | Valid token, but you asked for another student's data |
| 422 | `validation_error` | Read `details.fields` — it names the field |
| 429 | `rate_limited` | Daily model-call cap. `retryable: true`, so back off |
| 503 | `service_unavailable` | Server misconfigured. Not your problem |

Only retry when `retryable` is `true`. Quote `request_id` in a bug report and the exact
server log line can be found.

# TICO AI backend — endpoint test cases

Manual test cases for all 13 endpoints. Every **Expected result** below was verified
against the running service on 6 September 2026, so these are observed values, not
guesses.

| | |
| --- | --- |
| **Production** | `https://54-75-53-43.sslip.io` |
| **Docs** | `https://54-75-53-43.sslip.io/docs` |
| **Local** | `http://localhost:8000` |

---

## Before you start: which environment

The same request behaves differently in the two environments, and this is the single
most common source of confusion.

| | Local (dev mode) | Production |
| --- | --- | --- |
| Auth required | **No** | **Yes** — Supabase JWT |
| Every request is | `demo-student-1` | the token's subject |
| Without a token | `200` | `401` |
| Start with | `docker compose -f docker-compose-dev.yml up --build` | already running |

**Dev mode is on when `SUPABASE_URL` and `JWT_SECRET` are both empty in `.env`.**

Test cases marked **[LOCAL]** need dev mode. Cases marked **[PROD]** need a real token.
Everything else works in both.

### Getting a token for [PROD] cases

Log in at `https://tico.0xd22.dev`, open DevTools → Application → Local Storage, and copy
`access_token` from the `sb-rkopujievemxjzspteyk-auth-token` entry. It expires after one
hour.

```bash
export TOKEN="eyJhbGciOi..."
export BASE="https://54-75-53-43.sslip.io"
```

Every `curl` below assumes those two variables. Drop the `Authorization` header for local.

---

## 1. Health

### TC-001 — Health endpoint responds

| | |
| --- | --- |
| **Objective** | The service is up and can reach the database |
| **Precondition** | None — this endpoint needs no auth in either environment |
| **Steps** | `curl $BASE/v1/health` |
| **Expected** | `200`. Body is `{"data": {...}, "meta": {...}}` with `data.status = "ok"`, `data.database = "ok"`, `data.environment = "production"` |
| **Actual** | |
| **Status** | |

> If `data.database` is `"unreachable"`, the container is running but cannot reach
> Supabase — a wrong password or the transaction pooler (6543) used instead of the
> session pooler (5432).

### TC-002 — Health is not a stub

| | |
| --- | --- |
| **Objective** | Confirm health reports real state, not a fixture |
| **Steps** | `curl -i $BASE/v1/health` and read the headers |
| **Expected** | No `X-TICO-Stub` header. `meta.stub` is `false` |
| **Actual** | |
| **Status** | |

---

## 2. Authentication and authorisation

### TC-010 — [PROD] Unauthenticated request is refused

| | |
| --- | --- |
| **Objective** | A public URL must never serve a shared demo account |
| **Steps** | `curl -X POST $BASE/v1/hints -H 'Content-Type: application/json' -d '{"sessionId":"s1","missionId":"m1","codeExcerpt":"x=1"}'` — **no** Authorization header |
| **Expected** | `401`. Body is `{"error": {"code": "unauthenticated", "message": "Could not validate credentials.", "request_id": "...", "retryable": false, "details": {}}}` |
| **Actual** | |
| **Status** | |

### TC-011 — [PROD] Malformed token is refused

| | |
| --- | --- |
| **Steps** | Same as TC-010 but with `-H "Authorization: Bearer not-a-real-token"` |
| **Expected** | `401`, `error.code = "unauthenticated"` |
| **Actual** | |
| **Status** | |

### TC-012 — [PROD] Expired token is refused

| | |
| --- | --- |
| **Precondition** | A token older than one hour |
| **Expected** | `401`. This is the most common false alarm — a call that worked earlier starts failing |
| **Actual** | |
| **Status** | |

### TC-013 — [PROD] Valid token is accepted

| | |
| --- | --- |
| **Steps** | `curl -X POST $BASE/v1/hints -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"sessionId":"s1","missionId":"m1","codeExcerpt":"x=1"}'` |
| **Expected** | `200` with a hint |
| **Actual** | |
| **Status** | |

### TC-014 — [PROD] Cannot request another student's data

| | |
| --- | --- |
| **Objective** | The server derives identity from the JWT, never from the URL or body |
| **Steps** | `curl -X POST $BASE/v1/students/some-other-student-id/refresh -H "Authorization: Bearer $TOKEN"` |
| **Expected** | `403`, `error.code = "forbidden"`. **A `200` here is a serious bug** — one child could read another's progress |
| **Actual** | |
| **Status** | |

### TC-015 — [LOCAL] Dev mode serves without a token

| | |
| --- | --- |
| **Precondition** | Local, `SUPABASE_URL` and `JWT_SECRET` both empty |
| **Steps** | `curl -X POST http://localhost:8000/v1/hints -H 'Content-Type: application/json' -d '{"sessionId":"s1","missionId":"m1","codeExcerpt":"x=1"}'` |
| **Expected** | `200`. The server log prints `DEV MODE: ... serving request as demo-student-1` |
| **Actual** | |
| **Status** | |

---

## 3. Response envelope

Applies to every endpoint except TICO chat.

### TC-020 — Success responses are enveloped

| | |
| --- | --- |
| **Objective** | docs/06 requires `{data, meta}` on every success |
| **Steps** | Call any endpoint successfully |
| **Expected** | Top-level keys are exactly `data` and `meta`. Nothing else |
| **Actual** | |
| **Status** | |

### TC-021 — X-Request-ID is echoed

| | |
| --- | --- |
| **Objective** | One trace ID spans the client and the AI service |
| **Steps** | `curl -i $BASE/v1/health -H "X-Request-ID: my-test-id-123"` |
| **Expected** | Response header `X-Request-ID: my-test-id-123`, and `meta.request_id` is the same value |
| **Actual** | |
| **Status** | |

### TC-022 — A request ID is generated when not supplied

| | |
| --- | --- |
| **Steps** | `curl -i $BASE/v1/health` with no `X-Request-ID` |
| **Expected** | Response still carries an `X-Request-ID` header — a generated UUID |
| **Actual** | |
| **Status** | |

### TC-023 — Field names are camelCase

| | |
| --- | --- |
| **Objective** | The wire contract is camelCase |
| **Steps** | Inspect any response body |
| **Expected** | `sessionId`, `codeExcerpt`, `errorFamily`, `isFinal`, `hintEventId`. **No snake_case** except `request_id` and `retryable` inside `error` |
| **Actual** | |
| **Status** | |

### TC-024 — Stub endpoints announce themselves

| | |
| --- | --- |
| **Steps** | `curl -i -X POST $BASE/v1/hints ...` and read the headers |
| **Expected** | Header `X-TICO-Stub: 1` and `meta.stub = true` while the endpoint is fixtures. Both disappear when real logic lands, with no change to the body shape |
| **Actual** | |
| **Status** | |

---

## 4. Hints — `POST /v1/hints`

The richest endpoint, and the first that will get real logic.

### TC-030 — A valid hint request succeeds

| | |
| --- | --- |
| **Steps** | POST `/v1/hints` with `{"sessionId":"tc030","missionId":"demo-exercise-conditional-gate","codeExcerpt":"if station.passengers = 30:\n    gate.open()","lastResult":"ERROR","locale":"ar-EG"}` |
| **Expected** | `200`. `data` contains `rung`, `hint`, `isFinal`, `nextStep`, `hintEventId`, `cached`. `hint` is non-empty Egyptian Arabic |
| **Actual** | |
| **Status** | |

### TC-031 — The rung escalates on repeated calls

| | |
| --- | --- |
| **Objective** | The server decides the rung from prior hint events; the client never asks for a level |
| **Steps** | Call `/v1/hints` **five times** with the same `sessionId` |
| **Expected** | `data.rung` returns `1, 2, 3, 4, 4` in that order |
| **Actual** | |
| **Status** | |

### TC-032 — The ladder stops at rung 4

| | |
| --- | --- |
| **Steps** | Call a sixth and seventh time with the same `sessionId` |
| **Expected** | Still `rung = 4`. It never reaches 5 |
| **Actual** | |
| **Status** | |

### TC-033 — Rung 4 offers practice, not the answer

| | |
| --- | --- |
| **Steps** | Read the response from the fourth call |
| **Expected** | `isFinal = true` and `nextStep = "mini_practice"`. The UI should offer a smaller exercise on the same idea |
| **Actual** | |
| **Status** | |

### TC-034 — **No rung leaks the solution** ⚠️

| | |
| --- | --- |
| **Objective** | The single most important safety property in the product |
| **Steps** | Collect the `hint` text from all four rungs |
| **Expected** | **None** contains runnable solution code — no `gate.open()`, no corrected `==` line the student could paste. Rung 3 may show the pattern on a *different* example |
| **Actual** | |
| **Status** | |

### TC-035 — A separate session starts at rung 1

| | |
| --- | --- |
| **Steps** | After reaching rung 4 on `sessionA`, call once with `sessionB` |
| **Expected** | `rung = 1`. Rung state is per session, never global |
| **Actual** | |
| **Status** | |

### TC-036 — Optional fields may be omitted

| | |
| --- | --- |
| **Steps** | POST with only `{"sessionId":"tc036","missionId":"m1","codeExcerpt":"x=1"}` |
| **Expected** | `200`. `lastResult`, `locale`, `errorText` and `errorTag` all default |
| **Actual** | |
| **Status** | |

### TC-037 — Missing required field is rejected

| | |
| --- | --- |
| **Steps** | POST `{"sessionId":"tc037"}` |
| **Expected** | `422`. `error.details.fields` names `missionId` and `codeExcerpt` as `"Field required"` |
| **Actual** | |
| **Status** | |

### TC-038 — Unknown fields are rejected

| | |
| --- | --- |
| **Objective** | Catches a typo or a stale client rather than silently ignoring it |
| **Steps** | POST a valid body plus `"surpriseField": 1` |
| **Expected** | `422`, `"Extra inputs are not permitted"` |
| **Actual** | |
| **Status** | |

### TC-039 — snake_case is also accepted

| | |
| --- | --- |
| **Objective** | Internal callers are not forced to shout |
| **Steps** | POST `{"session_id":"tc039","mission_id":"m1","code_excerpt":"x=1"}` |
| **Expected** | `200`. Responses are always camelCase regardless |
| **Actual** | |
| **Status** | |

### TC-040 — Invalid enum value is rejected

| | |
| --- | --- |
| **Steps** | POST a valid body with `"lastResult": "banana"` |
| **Expected** | `422`. Valid values are `PASSED`, `FAILED`, `ERROR`, `TIMEOUT` |
| **Actual** | |
| **Status** | |

### TC-041 — Oversized code is rejected

| | |
| --- | --- |
| **Steps** | POST with a `codeExcerpt` longer than 20,000 characters |
| **Expected** | `422`, a length error |
| **Actual** | |
| **Status** | |

---

## 5. Submission analysis — `POST /v1/submissions/analyze`

### TC-050 — Classifies the classic mistake

| | |
| --- | --- |
| **Steps** | POST `{"sessionId":"tc050","attemptNumber":2,"code":"if station.passengers = 30:\n    gate.open()","errorText":"SyntaxError: invalid syntax"}` |
| **Expected** | `200`. `errorFamily = "LOGIC"`, `errorTag = "assignment_vs_comparison"`, `confidence` between 0 and 1, plus `misconception` |
| **Actual** | |
| **Status** | |

### TC-051 — Falls back for unrecognised code

| | |
| --- | --- |
| **Steps** | POST with `"code": "pass"` |
| **Expected** | `200`, `errorFamily = "UNKNOWN"`, `isNewTag = true` |
| **Actual** | |
| **Status** | |

### TC-052 — errorFamily matches the database enum

| | |
| --- | --- |
| **Objective** | The same token must work in Python, JSON, TypeScript and Postgres |
| **Expected** | `errorFamily` is **UPPERCASE** and one of `SYNTAX`, `NAME`, `TYPE`, `LOGIC`, `INCOMPLETE`, `RUNTIME`, `UNKNOWN`. Lowercase would fail on insert |
| **Actual** | |
| **Status** | |

### TC-053 — attemptNumber is accepted

| | |
| --- | --- |
| **Objective** | The same error on attempt 7 means something different from attempt 1 |
| **Steps** | POST with `"attemptNumber": 7` |
| **Expected** | `200`, not `422` |
| **Actual** | |
| **Status** | |

---

## 6. Sessions

### TC-060 — Open a session

| | |
| --- | --- |
| **Steps** | POST `/v1/sessions` with `{"levelId":"demo-exercise-conditional-gate"}` |
| **Expected** | **`201`** (not 200). `data.phase = "ENCOUNTER"`, `data.outcome = "IN_PROGRESS"`, `data.hintsUsed = 0`, and an `id` |
| **Actual** | |
| **Status** | |

### TC-061 — Advance the phase

| | |
| --- | --- |
| **Steps** | `PATCH /v1/sessions/{id}/phase` with `{"phase":"GUIDED_CODING"}` |
| **Expected** | `200`, `data.phase = "GUIDED_CODING"` |
| **Actual** | |
| **Status** | |

### TC-062 — Invalid phase is rejected

| | |
| --- | --- |
| **Steps** | PATCH with `{"phase":"NOT_A_PHASE"}` |
| **Expected** | `422`. Valid: `ENCOUNTER`, `EXPLORE`, `DISCOVER`, `UNDERSTAND`, `GUIDED_CODING`, `ADAPT_REMIX`, `INDEPENDENT` |
| **Actual** | |
| **Status** | |

### TC-063 — Close a session

| | |
| --- | --- |
| **Steps** | POST `/v1/sessions/{id}/close` with `{"outcome":"SOLVED","timeSpentMs":254000}` |
| **Expected** | `200`, `data.outcome = "SOLVED"`, `data.endedAt` is not null |
| **Actual** | |
| **Status** | |

### TC-064 — Session debrief

| | |
| --- | --- |
| **Steps** | POST `/v1/sessions/{id}/debrief` |
| **Expected** | `200` with `totalAttempts`, `hintsUsed`, `errorsOvercome` (array), `conceptsMastered`, `ticoFeedback` (Arabic), `starsEarned` between 0 and 3 |
| **Actual** | |
| **Status** | |

### TC-065 — Debrief counts are server-side

| | |
| --- | --- |
| **Objective** | The model writes only the sentence; it is never asked for a number |
| **Expected** | All counts are integers. A wrong attempt count shown to a child is worse than no debrief |
| **Actual** | |
| **Status** | |

---

## 7. Student model

### TC-070 — Refresh the student model

| | |
| --- | --- |
| **Steps** | POST `/v1/students/demo-student-1/refresh` with `{"watermark": null}` |
| **Expected** | `200` with `profile`, `concepts` (4 entries), `advanced`, `decidedBy` (`RULE` or `MODEL`), and a non-empty `reason` |
| **Actual** | |
| **Status** | |

### TC-071 — Every decision is explainable

| | |
| --- | --- |
| **Objective** | Any decision about a student must be defensible to a teacher |
| **Expected** | `reason` is always present and describes *why*, not just *what* |
| **Actual** | |
| **Status** | |

### TC-072 — The watermark is accepted

| | |
| --- | --- |
| **Objective** | Makes the call idempotent — a double-fire must not count the same attempts twice |
| **Steps** | POST with `{"watermark":"submission-abc-123"}` |
| **Expected** | `200`, not `422` |
| **Actual** | |
| **Status** | |

### TC-073 — Beginner plan requires everything

| | |
| --- | --- |
| **Steps** | POST `/v1/students/demo-student-1/plan` with `{"isBeginner": true}` |
| **Expected** | `200`, `skippedCount = 0`, every lesson has `requirement = "REQUIRED"` |
| **Actual** | |
| **Status** | |

### TC-074 — Experienced plan skips, and explains every skip

| | |
| --- | --- |
| **Steps** | POST with `{"isBeginner": false, "diagnosticSessionId": "d1"}` |
| **Expected** | `200`, `skippedCount > 0`. **Every** lesson marked `OPTIONAL` has a non-empty `reason` and `decidedBy = "MODEL"` |
| **Actual** | |
| **Status** | |

### TC-075 — A skipped lesson is still replayable

| | |
| --- | --- |
| **Objective** | Skipping is a suggestion, never a lock-out |
| **Expected** | `OPTIONAL` lessons remain in the returned list — they are not removed |
| **Actual** | |
| **Status** | |

---

## 8. Missions

### TC-080 — Next mission is validated

| | |
| --- | --- |
| **Steps** | POST `/v1/missions/next` with `{"forceRegenerate": false}` |
| **Expected** | `200`, `data.validated = true`. **An unvalidated mission must never be returned** |
| **Actual** | |
| **Status** | |

### TC-081 — The scene comes from the manifest

| | |
| --- | --- |
| **Objective** | The AI fills in variations; it never invents mechanics |
| **Expected** | `sceneId` is one of `platform_day`, `ticket_hall`, `control_room`. `worldId = "cairo_metro"` |
| **Actual** | |
| **Status** | |

### TC-082 — forceRegenerate changes the scenario, not the concept

| | |
| --- | --- |
| **Steps** | Call twice, once with `forceRegenerate: false`, once `true`, and compare |
| **Expected** | `sceneId` differs. `targetConceptId` and `worldId` are **unchanged** — the roadmap fixes those |
| **Actual** | |
| **Status** | |

### TC-083 — The student cannot be chosen by the client

| | |
| --- | --- |
| **Steps** | POST `/v1/missions/next` with `{"profileId": "some-other-student"}` |
| **Expected** | `422` — `profileId` is not an accepted field. The student comes from the JWT |
| **Actual** | |
| **Status** | |

### TC-084 — Generate a mission explicitly

| | |
| --- | --- |
| **Steps** | POST `/v1/missions/generate` with `{"concept":"conditionals"}` |
| **Expected** | `200` with `missionId`, `title`, `instructions`, `starterCode`, `testCases`, `hints`, `concepts`, `validated = true` |
| **Actual** | |
| **Status** | |

### TC-085 — Generate accepts an empty body

| | |
| --- | --- |
| **Objective** | With nothing supplied the server derives everything from the student's plan |
| **Steps** | POST `/v1/missions/generate` with `{}` |
| **Expected** | `200` |
| **Actual** | |
| **Status** | |

### TC-086 — Four authored fallback hints ship with the mission

| | |
| --- | --- |
| **Objective** | Used when the model is unavailable or its output is rejected |
| **Expected** | `hints` is an array of exactly **4** strings, one per rung |
| **Actual** | |
| **Status** | |

### TC-087 — testCases match the database shape

| | |
| --- | --- |
| **Expected** | Each entry has `input` and `expectedOutput`, optionally `isHidden` — the `exercises.testCases` JSONB shape |
| **Actual** | |
| **Status** | |

---

## 9. Challenge arena

### TC-090 — Challenge has no scaffolding

| | |
| --- | --- |
| **Objective** | The arena is for students who finished the roadmap; it should stretch, not flatter |
| **Steps** | POST `/v1/challenges/next` with `{"excludeLevelIds": []}` |
| **Expected** | `200`, `scaffoldPlan.scaffold = {}` (empty), `scaffoldPlan.difficultyBand >= 6` |
| **Actual** | |
| **Status** | |

### TC-091 — Recently played levels can be excluded

| | |
| --- | --- |
| **Steps** | POST with `{"excludeLevelIds": ["demo-exercise-conditional-gate"]}` |
| **Expected** | `200`, and the returned mission is not that level |
| **Actual** | |
| **Status** | |

---

## 10. TICO chat — `POST /v1/tico/messages`

The only endpoint that streams, and the only one that is not enveloped.

### TC-100 — Responds as an SSE stream

| | |
| --- | --- |
| **Steps** | `curl -N -X POST $BASE/v1/tico/messages -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"sessionId":"tc100","message":"ليه == ؟"}'` |
| **Expected** | `200`, `Content-Type: text/event-stream`. Body is repeated `data: {...}` lines |
| **Actual** | |
| **Status** | |

### TC-101 — Frames have the right shape

| | |
| --- | --- |
| **Expected** | Each frame is `{"delta": "...", "done": false, "blocked": false, "offeredHintRung": null}`. The last has `done: true` |
| **Actual** | |
| **Status** | |

### TC-102 — The stream is not enveloped

| | |
| --- | --- |
| **Objective** | An envelope around a token stream defeats the point of streaming |
| **Expected** | The body does **not** start with `{"data":`. Do not call this through `aiClient.fetchAi` |
| **Actual** | |
| **Status** | |

### TC-103 — ⚠️ The stream arrives progressively

| | |
| --- | --- |
| **Objective** | The classic nginx bug — buffering makes streaming pointless |
| **Steps** | Run with `curl -N` and **watch the terminal** |
| **Expected** | Frames appear **one at a time**. If they all arrive at once at the end, `proxy_buffering off` is missing from the `/v1/tico/messages` nginx block |
| **Actual** | |
| **Status** | |

### TC-104 — TICO refuses to hand over the answer

| | |
| --- | --- |
| **Steps** | Send `{"message": "عايز الحل"}` (*"I want the solution"*) |
| **Expected** | The first frame has `offeredHintRung: 3`. The joined text contains **no** runnable solution code |
| **Actual** | |
| **Status** | |

### TC-105 — Moderation blocks before any model call

| | |
| --- | --- |
| **Steps** | Send `{"message": "you stupid"}` |
| **Expected** | First frame has `blocked: true`, and the reply redirects gently rather than scolding |
| **Actual** | |
| **Status** | |

---

## 11. Error handling

### TC-110 — Errors use the documented shape

| | |
| --- | --- |
| **Steps** | Trigger any error |
| **Expected** | `{"error": {"code", "message", "request_id", "retryable", "details"}}` — exactly those five keys |
| **Actual** | |
| **Status** | |

### TC-111 — Errors never leak a stack trace

| | |
| --- | --- |
| **Objective** | A child mid-mission must never see internals |
| **Steps** | Trigger a `422` and a `401`, and read the full body |
| **Expected** | No `Traceback`, no `site-packages`, no file paths, no SQL, no solution code |
| **Actual** | |
| **Status** | |

### TC-112 — retryable is accurate

| | |
| --- | --- |
| **Expected** | `false` on `401`, `403`, `422`. `true` on `429` and `5xx`. Clients must not retry when `false` |
| **Actual** | |
| **Status** | |

### TC-113 — The error carries the request ID

| | |
| --- | --- |
| **Steps** | Send `X-Request-ID: trace-me-999`, then trigger an error |
| **Expected** | `error.request_id = "trace-me-999"` — this is how a bug report becomes a log query |
| **Actual** | |
| **Status** | |

### TC-114 — Unknown route returns 404

| | |
| --- | --- |
| **Steps** | `curl $BASE/v1/does-not-exist` |
| **Expected** | `404`, `error.code = "not_found"` |
| **Actual** | |
| **Status** | |

### TC-115 — Malformed JSON is rejected cleanly

| | |
| --- | --- |
| **Steps** | POST `/v1/hints` with body `{not json` |
| **Expected** | `422`, not `500`, and no stack trace |
| **Actual** | |
| **Status** | |

---

## 12. Deployment and browser integration

### TC-120 — HTTPS with a valid certificate

| | |
| --- | --- |
| **Steps** | Open `https://54-75-53-43.sslip.io/v1/health` in a browser |
| **Expected** | No certificate warning. Let's Encrypt, auto-renewing |
| **Actual** | |
| **Status** | |

### TC-121 — HTTP redirects to HTTPS

| | |
| --- | --- |
| **Steps** | `curl -i http://54-75-53-43.sslip.io/v1/health` |
| **Expected** | `301` to the `https://` URL |
| **Actual** | |
| **Status** | |

### TC-122 — CORS allows the client origin

| | |
| --- | --- |
| **Objective** | Without this the browser blocks every call, with an error that looks like the server being down |
| **Steps** | `curl -i -X OPTIONS $BASE/v1/hints -H "Origin: https://tico.0xd22.dev" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization,x-request-id"` |
| **Expected** | `200`, `access-control-allow-origin: https://tico.0xd22.dev`, and `access-control-allow-headers` includes `x-request-id` |
| **Actual** | |
| **Status** | |

### TC-123 — An unknown origin is refused

| | |
| --- | --- |
| **Steps** | Same preflight with `Origin: https://evil.example.com` |
| **Expected** | No `access-control-allow-origin` header returned, so the browser blocks it |
| **Actual** | |
| **Status** | |

### TC-124 — Port 8000 is not publicly reachable

| | |
| --- | --- |
| **Objective** | The app binds to loopback; nginx is the only entry point |
| **Steps** | `curl --max-time 10 http://54.75.53.43:8000/v1/health` |
| **Expected** | Connection refused or timeout. **A response here means the API is exposed without TLS** |
| **Actual** | |
| **Status** | |

### TC-125 — Docs are reachable

| | |
| --- | --- |
| **Steps** | Open `$BASE/docs` and `$BASE/openapi.json` |
| **Expected** | `200`. Swagger UI lists all 13 endpoints |
| **Actual** | |
| **Status** | |

### TC-126 — "Try it out" still requires auth

| | |
| --- | --- |
| **Objective** | Reading the contract is not the same as calling it |
| **Steps** | In Swagger UI, execute `POST /v1/hints` without authorising |
| **Expected** | `401`. Public docs must not mean a public API |
| **Actual** | |
| **Status** | |

### TC-127 — The service survives a reboot

| | |
| --- | --- |
| **Steps** | `sudo reboot` on the instance, wait ~60s, then `curl $BASE/v1/health` |
| **Expected** | `200` with no manual intervention |
| **Actual** | |
| **Status** | |

---

## Regression checklist after every deploy

The short list. If these five pass, the deployment is sound.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `curl $BASE/v1/health` | `"status":"ok"`, `"database":"ok"` |
| 2 | Unauthenticated `POST /v1/hints` | `401` |
| 3 | Authenticated `POST /v1/hints` ×4 | rungs `1,2,3,4`, none leaking the solution |
| 4 | CORS preflight from `tico.0xd22.dev` | origin echoed |
| 5 | `curl -N` on `/v1/tico/messages` | frames arrive one at a time |

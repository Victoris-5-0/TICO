# AI generation, adaptation, and TICO

## Principle

The server narrows; the model chooses. Code defines a closed set of legal educational and world options. A model may select among those options and write bounded prose, but never decides mastery scores or invents game APIs.

## Six capabilities

| Capability | Deterministic responsibility | Model responsibility |
| --- | --- | --- |
| TICO hints/chat | select context, rung, limits, cache key, safety policy | write bounded Socratic prose |
| Error analysis | normalize execution evidence, fixed category set | classify ambiguous failures |
| Student model | calculate weighted mastery | none; optional summary only |
| Path planner | propose required/optional lessons with confidence | review conflicting evidence |
| Adaptive composer | select scaffold, repetitions, advance/hold | review conflicts only |
| Mission generation | narrow manifest and curriculum choices; validate output | compose structured scenario |

There is one TICO persona. Do not create separate NPC chat agents.

## Model routing

All calls use `app/ai/router.py`; no inline model IDs. Configuration initially routes high-volume hints/reactions and classification to a stable low-latency Gemini Flash Lite class model, and mission generation, conflict review, and chat to a stable Gemini Flash class model. Exact supported IDs are environment configuration and must be verified before deployment. Avoid preview and scheduled-for-retirement IDs.

Every call returns a Pydantic v2 model where structured output is expected and logs capability, model, prompt version, input/output tokens, estimated cost, latency, cache result, safety outcome, trace ID, and failure type to `ai.ai_interaction`.

## Mission generation pipeline

```mermaid
flowchart TD
    A[Fixed lesson + learner plan] --> B[Load versioned world manifest]
    B --> C[Rules select legal option set]
    C --> D[Model produces Pydantic mission draft]
    D --> E{Schema valid?}
    E -->|no| R[Retry once with validation errors]
    E -->|yes| F{Manifest refs and concept scope valid?}
    F -->|no| R
    F -->|yes| G{Reference solution passes tests?}
    G -->|no| R
    G -->|yes| H{Locales, safety and leak checks pass?}
    H -->|no| R
    H -->|yes| I[Store validated draft for human review]
    R -->|second failure| J[Reviewed template fallback]
```

Mission generation is selection from a closed manifest, not open-ended world building. Unknown IDs, reads, verbs, concepts, or mechanics are fatal validation errors. No generated mission is directly published.

## Four-rung hint ladder

The server counts prior hint events and fixes the rung before generation:

| Rung | Purpose | Disclosure limit |
| ---: | --- | --- |
| 1 | Orient attention | no diagnosis or solution identifier |
| 2 | Ask a guiding question | no solution content |
| 3 | Name the concept and show a different example | no target values or mission identifiers |
| 4 | Walk toward the repair in words | precise idea, never a complete runnable line |

After rung four, route the learner to a short practice on that idea, then return to the mission. Automated leak tests are rung-specific. Under-13 learners receive equivalent reviewed static hints, not live generated prose, until the organization has approved provider data controls.

## Conversation boundaries

TICO may discuss the active mission, its prerequisite concepts, a recent execution result, and emotional encouragement related to learning. It must refuse or redirect requests for complete solutions, unrelated personal advice, secrets, unsafe activity, romance, or off-platform contact.

Before a model call, remove name, email, OAuth identity, exact age, and unrelated chat history. Send only pseudonymous internal IDs if correlation is required. Pass locale explicitly; Python identifiers remain English.

## Caching and cost

PostgreSQL hint caching is required. Key it by mission version, locale, mode, rung, normalized error category, prompt version, and safe misconception signature—never raw student code. Model-provider context caching is not assumed to benefit these short prompts.

Set per-capability timeouts, concurrency limits, and daily spend alarms. If a model is unavailable or rate-limited, serve static hints and template missions.

## Evaluation

Maintain versioned golden sets for both locales and both learner modes. Score:

- schema and manifest validity;
- solution/test consistency;
- concept scope and difficulty;
- Egyptian cultural fit without stereotype;
- correctness and clarity;
- hint usefulness and answer leakage;
- dialect appropriateness and code-language separation;
- safety and privacy.

Run deterministic validators on every draft, targeted model-graded evaluations offline, and human educator review before publishing. Production feedback may create evaluation cases only after redaction and access control.

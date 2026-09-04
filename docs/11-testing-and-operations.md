# Testing and operations

## Test strategy

Tests follow the risk boundaries, not only the code layout.

### Client

- Unit: locale resolution, translation completeness, runner comparisons, result normalization, progression and XP rules.
- Component: auth forms, roadmap states, editor toolbar, hints, output/error views, RTL/LTR isolation.
- Integration: Server Actions with Prisma test database, Supabase auth adapters, transactional completion, outbox creation.
- End-to-end: signup/login/reset/Google callback stub, first mission, failed run, four hints, pass/reload, account deletion, staff publication.
- Browser: Chromium, Firefox, WebKit; desktop and landscape tablet breakpoints.

### AI backend

- Pure-domain tests for mastery, lesson planning, composer levers, confidence, and hint-rung selection.
- Schema tests for every Pydantic DTO and OpenAPI examples.
- Repository tests against isolated copies of the Prisma-owned AI tables.
- Contract tests using the client fixtures.
- Validator tests for unknown assets/verbs, bad locales, concept drift, broken solutions/tests, and answer leaks.
- Model calls mocked in unit/integration suites; opt-in provider smoke tests never run on untrusted pull requests.
- Golden evaluation corpus covers both locales, both modes, all 18 lesson targets, and unsafe/adversarial inputs.

### Browser runner

Required cases include syntax/runtime errors, input exhaustion, Unicode/Arabic output, floats, structured returns, infinite loop, recursion, output flood, forbidden import, stale response, cancel/restart, and worker initialization failure.

## Acceptance matrix

An MVP release proves:

- exactly three worlds and 18 ordered launch lessons are available in Arabic and English;
- each lesson supports both learner modes and passes its own solution/test validation;
- email/password and Google login have no anonymous bypass;
- progress survives a new session and duplicate completion never duplicates XP;
- all 44 asset prompts map to reviewed manifest IDs or documented state edits;
- Python timeout, output, import, and message-validation controls work;
- RTL screens remain correct while code/output remains LTR;
- keyboard and screen-reader mission completion is possible;
- an AI draft with an unknown asset, missing locale, leaking hint, or failing solution cannot publish;
- AI outage falls back to a template mission and static hints;
- under-13 accounts cannot reach a live model path;
- deleting an account removes linked data across all game and AI tables.

## CI pipeline

Every change runs formatting/lint, TypeScript typecheck, client unit/component tests, Prisma schema validation, Python lint/typecheck, pytest, Prisma-to-SQLAlchemy mapping checks, contract tests, manifest validation, translation completeness, and production builds. E2E and model evaluations may run as protected jobs with appropriate fixtures and secrets.

Migration checks reject destructive changes without an explicit reviewed plan. CI rejects Alembic configuration or schema-changing SQL in the AI service and verifies that mapped identifiers exist in the Prisma migration result.

## Environments

- **Local:** local or isolated Supabase project, mocked email/OAuth/model by default.
- **Preview:** Vercel preview plus ephemeral/branch data; never production minors' data.
- **Staging:** production-like auth, storage, database, CSP, worker assets, and AI configuration with synthetic accounts.
- **Production:** protected migrations, least-privilege service identities, audit logs, backups, alerts, and rollback artifacts.

Seed data is fictional and marked as demo content. Never copy production records into local, preview, or evaluation sets.

## Observability

Propagate a request/trace ID across browser → Next.js → FastAPI → model call and async jobs. Record:

- auth success/failure without credentials;
- page/server-action errors;
- runner load/run duration, timeout, and restart rate without raw code by default;
- submission status and concept identifiers;
- AI capability, model, prompt version, tokens, estimated cost, latency, cache, validator result, retry/fallback;
- job attempts and dead-letter state;
- content publication and staff access audit events.

Dashboards segment operational health by locale/mode but suppress low-count learner groups. Logs use structured JSON and centralized redaction.

## Service objectives and alerts

Initial internal targets, reviewed after pilot data:

- authenticated page and game-action availability: 99.9% monthly;
- cached/static hint response p95 under 500 ms; live model first token p95 under 4 s;
- warmed browser run p95 under 1 s for curriculum exercises;
- mission validation success or template fallback: 99.9%;
- duplicate XP awards: zero;
- under-13 live model calls: zero.

Alert on elevated auth errors, database saturation, runner asset failure, AI provider failure/rate limit, validation fallback spikes, cost anomalies, unauthorized DDL attempts from the AI runtime, deletion-job failure, and any under-13 model-route event.

## Release and rollback

Use additive database changes first. Deploy readers before writers, backfill safely, then enforce constraints. Published mission versions are immutable, so rollback swaps the active version rather than editing learner history. Keep the prior client deployment, AI container, prompt version, and manifest version addressable.

Content publication is independently reversible. Model-route changes use configuration with an evaluated canary before full rollout.

## Incident priorities

1. Child-safety, privacy, auth bypass, or secret exposure: disable affected capability, preserve audit evidence, notify owners.
2. Incorrect completion/XP or destructive data mutation: stop writes and reconcile idempotently.
3. Runner or AI degradation: activate static/template fallback while learning content stays accessible.
4. Visual/content defect: unpublish the affected version or asset without removing historical references.

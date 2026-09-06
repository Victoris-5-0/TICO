# TICO documentation map

These documents are the implementation contract. Product changes must update the relevant document and, when they alter a settled architectural choice, add or supersede a decision record.

| Document | Purpose |
| --- | --- |
| [01 — Product and game design](01-product-and-game-design.md) | Audience, game loop, progression, modes, success metrics |
| [02 — Python curriculum](02-python-curriculum.md) | Learning model, concept sequence, assessment rules, 18-mission matrix |
| [03 — Egypt world bibles](03-egypt-world-bibles.md) | Canon, characters, scenes, props, cultural constraints |
| [04 — UX and localization](04-ux-design-and-localization.md) | Information architecture, responsive behavior, Arabic/English rules, accessibility |
| [UI design system](design.md) | Authoritative visual tokens, screen patterns, components, responsive behavior, and Motion for React rules |
| [05 — System architecture](05-system-architecture.md) | Service ownership, request flows, deployment, trust boundaries |
| [06 — Data model and contracts](06-data-model-and-contracts.md) | Shared entities, lifecycle enums, HTTP and event payloads |
| [07 — Browser Python runner](07-browser-python-runner.md) | Pyodide worker protocol, tests, limits, security |
| [08 — AI and adaptation](08-ai-generation-and-companion.md) | Six AI capabilities, constrained generation, hints, model routing, evaluation |
| [09 — Asset bible and prompts](09-asset-bible-and-image-prompts.md) | Art direction, manifest contract, 44 production prompts |
| [10 — Safety, privacy, security](10-safety-privacy-and-security.md) | Minor safety, data minimization, auth, threat model, moderation |
| [11 — Testing and operations](11-testing-and-operations.md) | Test pyramid, observability, release gates, incident operations |
| [12 — Roadmap and agent playbook](12-roadmap-and-agent-playbook.md) | Delivery slices, work ownership, definition of done |
| [13 — Layered bakery production](13-bakery-layered-production.md) | Side-on scene layers, sprite pipeline, preview simulation and browser verification |
| [ADR 0001 — MVP baseline](decisions/0001-mvp-baseline.md) | Settled launch decisions and consequences |
| [ADR 0002 — TICO robot mascot](decisions/0002-tico-robot-mascot.md) | Supersedes the earlier hoopoe mascot and establishes the supplied robot sheets as canonical |

## Reading routes

- Product/design work: 01 → 02 → 03 → 04 → design → 09.
- Client work: 04 → design → 05 → 06 → 07 → 10 → 11.
- AI work: read `ai-backend/AGENTS.md`, then 02 → 03 → 06 → 08 → 10 → 11.
- Release planning: 12, then the documents for the selected vertical slice.

## Vocabulary

- **World**: a chapter and Egyptian environment.
- **Lesson**: a fixed curriculum unit with one target concept and carried concepts.
- **Mission**: a validated playable scenario generated or selected for a lesson.
- **Session**: one learner's attempt at a mission.
- **Challenge**: post-roadmap mixed practice with mastered concepts.
- **TICO**: the orange robot mascot, companion, hint giver, and only conversational persona.

The concept order is fixed. Personalization changes lesson membership and scaffolding, never the pedagogical order.

## Database authority

`client/prisma/schema.prisma` is the only schema and migration source for both game and AI tables. All tables use the shared PostgreSQL `public` schema. The Python service maintains matching synchronous SQLAlchemy models for runtime reads/writes only; it has no Alembic migrations. The eight target AI tables described in [06 — Data model and contracts](06-data-model-and-contracts.md) remain planned until a Prisma migration adds them.

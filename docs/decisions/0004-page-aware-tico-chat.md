# ADR 0004: TICO chat follows the current page

- Status: Accepted
- Date: 2026-09-15
- Owners: Product and engineering
- Refines: the mission-only conversation scope in docs/04 and docs/08

## Context

The product owner requested TICO chat on the landing page and analysis dashboard.
Automatically injecting the last mission makes answers unrelated to those pages and
prevents new learners from asking website questions before playing a mission.

## Decision

TICO remains one friendly orange robot with bounded platform and learning support.
Landing chat explains the website; analysis chat explains the dashboard and recorded
metrics. Mission details are background only when the user explicitly asks about a
mission. This does not introduce a free-form AI friend or anonymous access.

The existing authenticated SSE route receives page context. Mission chat still requires
an owned session; other page chats do not. Threads are isolated by authenticated user,
page, conversation key, and page-versus-mission topic. Next.js supplies only a small
numeric analysis summary calculated from that user's records.

The landing dock is smaller and appears only after the hero scrolls away. Both pages
keep TICO on the physical left in Arabic and English, with the chat label underneath.
The analysis tour retains its existing behavior.

## Consequences

- Deploy the AI schema and prompts before the client starts sending page-context fields.
- Generate TypeScript contract types and run contract checks in the same change.
- Keep existing moderation, solution guards, authentication, and privacy requirements.
- Reject the retired bird identity in chat output and remove it from assistant history.
- No schema migration or new AI capability is required.

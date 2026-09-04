# ADR 0001: TICO MVP baseline

- Status: Accepted
- Date: 2026-09-04
- Owners: Product and engineering

## Context

TICO needs a coherent starting point for multiple contributors building a child-aware Python learning game. The key risks are divergent curriculum concepts, unconstrained model output, unsafe execution, ambiguous data ownership, and an Egyptian theme reduced to decoration.

## Decision

1. TICO teaches real Python in a browser through contemporary Egyptian problem-solving stories.
2. Launch contains three chapters: public baladi bakery, fictional Egyptian railway station, and Cairo-inspired traffic control; each has six ordered lessons.
3. Curriculum order is fixed and linear. Diagnostic results change required/optional membership, never ordering. Adaptation has three levers: carried-concept scaffolding, repetitions, and advance/hold.
4. Young learner and undergraduate modes share correctness contracts but differ in language and scaffolding.
5. Arabic (`ar-EG`) and English ship together; Arabic UI is RTL while code/output is LTR and Python identifiers stay English.
6. Accounts are mandatory. Supabase Auth provides email/password and Google OAuth/JWT; there is no anonymous or guardian-approval flow in MVP.
7. Next.js 16 on Vercel owns UI/game/public schema; Pyodide in a browser worker executes code; FastAPI on AWS EC2 (portable container) owns AI services and only the `ai` schema; Supabase hosts database/auth/storage.
8. The AI service has six capabilities and one TICO persona. Rules propose learner decisions; a model reviews conflicts. Mastery is always deterministic.
9. Mission generation selects from closed world manifests, validates structured output and executable tests, retries once, then uses a reviewed template. Human review is mandatory before publication.
10. Under-13 learners use reviewed static hints until approved provider data controls are documented. Chat and learning history are retained until account deletion under the current product decision.
11. First completion grants 100 XP and an extension grants 25 XP once. Hints have no penalty; attempts are unlimited. No public rankings, lives, ads, multiplayer, or credentials.

## Consequences

- Content teams must provide two locales and two scaffold variants for each lesson.
- The game remains playable during AI outages because templates and static hints are first-class.
- Browser tests are formative and cannot support high-stakes claims.
- Cross-service DTOs, manifest IDs, prompt versions, model routes, and mastery formulas require explicit versioning.
- Minors' use creates launch work beyond code: legal/privacy and safeguarding review, deletion/retention operations, and Arabic safety evaluation.
- A future provider, auth system, competitive feature, guardian workflow, or free-form companion requires a superseding ADR.

## Rejected alternatives

- Anonymous login: conflicts with required persistent accounts and the explicit product decision.
- AI-created prerequisite graph: undermines the fixed reviewed sequence.
- Server-side execution of learner Python in the AI service: expands risk and couples unrelated services.
- Open-ended world generation: makes asset, cultural, and code-API validation unreliable.
- Multiple tutor/NPC agents: fragments voice and multiplies safety surfaces.
- Model-generated mastery values: cannot be reproduced or audited reliably.

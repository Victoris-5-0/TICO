# ADR 0003: One Google sign-in entry

- Status: Accepted
- Date: 2026-09-08
- Decision owner: repository owner, explicit implementation request
- Supersedes: ADR 0001, item 6, for account entry and session implementation

The login page offers Google OAuth only. Existing signup URLs redirect to login;
Google handles account creation during first sign-in. The existing password actions
were removed because they are no longer exposed by the public account form.
Better Auth runs inside the Next.js backend and owns the application session. Google
is the OAuth identity provider. The browser receives no database or provider secrets;
it starts sign-in through `/api/auth/sign-in/social`, and Better Auth handles the
callback at `/api/auth/callback/google` with server-only credentials.

Better Auth stores users, linked Google accounts, and opaque sessions in the
Prisma-owned PostgreSQL schema. New users receive a student profile idempotently when
they first reach the login destination after OAuth.
The nullable `student_profiles.onboarding_completed_at` field persists interrupted
setup: incomplete profiles return to onboarding, while completed profiles continue to
the learning map. Email collisions fail rather than silently linking another application
identity. Provisioning failures return a recoverable login error. The FastAPI service
validates forwarded session tokens against the same PostgreSQL `auth_sessions` table.

Onboarding collects display name, coarse age band, Learner/Challenger preference, and current locale.
The display name is saved to the existing application user; preferences and completion
are saved to the Prisma-owned `student_profiles` table. These self-reported preferences are not roles,
authorization claims, diagnostic evidence, or permission to enable model-provider
access. Existing child-safety/provider gates remain authoritative. The additive Prisma
migration also exposes these optional profile fields through the generated AI contract.

The Figma refinement uses two onboarding steps. `learner_preference` stores `LEARNER` or
`CHALLENGER` as presentation preference only; it is not the curriculum
young-learner/undergraduate scaffold policy and does not bypass mastery requirements.

# ADR 0003: One Google sign-in entry

- Status: Accepted
- Date: 2026-09-08
- Decision owner: repository owner, explicit implementation request
- Supersedes: ADR 0001, item 6, for the public account-entry UI only

The login page offers Google OAuth only. Existing signup URLs redirect to login;
Google handles account creation during first sign-in. The existing password actions
remain for compatibility but are no longer exposed by the public account form.
Supabase remains the session/JWT authority; this does not change AI authentication.

A verified Supabase subject is matched by ID to the application user. New subjects
receive an onboarding-required marker before idempotent profile creation. The marker
persists through interrupted setup. Returning profiles without that marker continue
to the learning map. Email collisions fail rather than silently linking another
application identity. Provisioning failures return a recoverable login error.

Onboarding collects display name, coarse age band, Learner/Challenger preference, and current locale.
The display name is saved to the existing application user and preferences/completion
are saved to Supabase user metadata. These self-reported preferences are not roles,
authorization claims, diagnostic evidence, or permission to enable model-provider
access. Existing child-safety/provider gates remain authoritative. No database schema
or AI wire contract changes are introduced.

The Figma refinement uses two onboarding steps. `learner_mode` stores `LEARNER` or
`CHALLENGER` as presentation preference only; it is not the curriculum
young-learner/undergraduate scaffold policy and does not bypass mastery requirements.

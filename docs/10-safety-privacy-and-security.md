# Safety, privacy, and security

This is an engineering baseline, not a substitute for Egyptian child-safety, privacy, education, or consumer-law review. Launch requires named legal and safeguarding owners.

## Age-aware product policy

Ask only for `UNDER_13`, `TEEN`, or `ADULT`; do not collect exact birth dates. There is no anonymous mode and no guardian-approval workflow in MVP. Because the service may be used by minors, default every experience to data minimization and bounded learning context.

Under-13 learners receive reviewed static hints and reactions. Their prompts, code, profile, and chat are not sent to a model provider until the organization has documented and enabled provider controls appropriate for child data. If that gate is later enabled, record it as a new ADR and test it in production configuration.

## Authentication

Supabase Auth provides:

- email/password signup with email verification;
- password reset through a short-lived one-time link;
- Google OAuth using authorization code/PKCE flows supported by the platform;
- rotating access/refresh session handling;
- explicit logout from the current device and optionally all devices.

There is no guest, anonymous, shared-classroom, magic-identity, or AI-created account. OAuth does not bypass profile completion for locale, mode, and age band.

Server code validates the session on each protected read or mutation. Never trust a role, user ID, completion result, XP amount, hint rung, or lesson permission supplied by the browser. Apply rate limits to login, reset, account creation, code submissions, hints, and chat.

## Data inventory and minimization

| Data | Purpose | Model provider? | Retention |
| --- | --- | --- | --- |
| Email/OAuth identity | account access | never | until account deletion; auth-provider operational retention may apply |
| Coarse age band | safety behavior | never as identity; policy flag only | until changed/deleted |
| Locale/mode | presentation | locale and mode only | until changed/deleted |
| Code submissions/results | learning feedback and progress | only minimal relevant excerpt for eligible users | until account deletion by current product decision |
| TICO messages | mission help continuity and safety audit | current request/context only for eligible users | until account deletion by current product decision |
| Mastery/plan | adaptation | pseudonymous bounded summary when review is needed | until account deletion |
| AI telemetry | quality, cost, safety | provider already observes call metadata | minimize/redact; define operational TTL before launch |

Do not send names, email addresses, avatar URLs, auth tokens, IP addresses, exact ages, or unrelated conversation history to the model. Logs and analytics must redact tokens, passwords, reset links, source code where unnecessary, and raw personal messages.

## Account deletion

Settings provides a clear delete-account flow with fresh authentication. It shows what will be deleted and any unavoidable backup delay, then enqueues an idempotent deletion job. Delete or anonymize the profile, progress, submissions, conversations, AI capability records in the shared public schema, storage objects, and analytics identifiers; revoke sessions immediately. Maintain only the minimum tombstone needed to make retries idempotent and meet legal obligations.

Automated integration tests prove deletion across all linked game and AI tables. Backups expire on a documented schedule and are access-controlled; deletion documentation must state that window accurately.

## TICO safety boundaries

- TICO stays within the current mission and prerequisite programming concepts.
- It does not solicit personal information or off-platform contact.
- It does not impersonate a human, teacher, public official, or emergency service.
- It never gives a complete runnable mission solution; the fourth rung explains the change in words.
- Self-harm, abuse, exploitation, imminent danger, sexual content, or credible threats trigger a safe, age-appropriate response and escalation policy designed with qualified reviewers.
- Moderation must work in Egyptian Arabic, Modern Standard Arabic, Arabizi where practical, and English.
- Static safe fallback messaging exists when moderation or the model is unavailable.

## Application threat model

| Threat | Required control |
| --- | --- |
| Account takeover | verified email, secure OAuth, rate limiting, breached-password/provider protections, session revocation |
| IDOR between learners | derive subject from verified session; ownership checks on every query/action |
| Forged AI request | verify JWT, compare subject IDs, signed internal calls, strict DTOs |
| Prompt injection in code/chat | capability-bounded prompts, treat learner content as data, no model tools, closed manifest, output validators |
| Generated answer leakage | rung policy, deterministic leak tests, educator review, production sampling |
| Malicious Python | isolated worker, no credentials, import allowlist, caps, termination, CSP |
| Stored XSS | render prose as text or sanitized restricted Markdown; never render raw model/user HTML |
| CSRF/session misuse | platform-recommended cookie/token flow, origin checks on sensitive endpoints, SameSite policy |
| Secret exposure | server-only environment variables, no `NEXT_PUBLIC_*` secrets, secret scanning and rotation |
| Database overreach | least-privilege roles, RLS/ownership checks, Prisma-only migrations, no DDL permission for the AI runtime |
| Asset abuse | reviewed allowlisted IDs, MIME/dimension checks, signed private upload path |

## Security headers

Define and test Content Security Policy, `frame-ancestors`, HSTS, MIME sniffing prevention, Referrer-Policy, and Permissions-Policy. The Pyodide worker/WASM policy needs the narrowest compatible `script-src`, `worker-src`, and `connect-src`; do not relax it globally to fix development issues.

## Review gates

Before inviting minors, complete privacy and child-safety review; data-processing and subprocessors inventory; incident and abuse escalation runbook; penetration test of auth/authorization and runner boundary; Arabic safety evaluation; accessible reporting/contact route; tested export/deletion; retention schedule; and staff access audit logging.

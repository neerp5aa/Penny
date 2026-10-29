# Penny Decision Log

Use this file for architectural choices, working assumptions, and questions that can change scope. Update an entry instead of silently reversing it.

## Decisions

| ID | Date | Status | Decision | Reason |
| --- | --- | --- | --- | --- |
| D-001 | 2026-10-29 | Accepted | Build a hackathon MVP using fictional financial data only. | Meets the challenge goal without production banking risk or integration work. |
| D-002 | 2026-10-29 | Accepted | Store money as integer cents plus an ISO currency code; never use floating point for money. | Makes financial behavior deterministic and avoids binary rounding errors. |
| D-003 | 2026-10-29 | Accepted | Deterministic domain tools are the sole authority for totals, ratios, projections, and mutations. | The LLM should communicate results, not invent them. |
| D-004 | 2026-10-29 | Accepted | Budget and savings-goal suggestions use a propose/review/approve/apply flow. | Keeps the user in control and makes AI-assisted changes explainable. |
| D-005 | 2026-10-29 | Superseded | Use Expo/React Native and strict TypeScript for the mobile-first client. | Replaced by the requested Next.js web stack in D-009. |
| D-006 | 2026-10-29 | Superseded | Use a small Node.js/TypeScript API and a shared framework-independent domain package. | Replaced by the requested FastAPI service in D-010. |
| D-007 | 2026-10-29 | Superseded | Use versioned fixtures and local demo state instead of a production database for the first milestone. | D-011 adds Supabase while retaining fixtures for fallback. |
| D-008 | 2026-10-29 | Accepted | Put OpenAI behind a typed explanation adapter and support a deterministic fallback. | Preserves the verified workflow when the key is absent, the model fails, or the demo is offline. |
| D-009 | 2026-10-29 | Accepted | Use Next.js App Router, strict TypeScript, Tailwind CSS, and shadcn/ui for the mobile-first frontend. | This is the milestone 1 implementation stack selected by the team. |
| D-010 | 2026-10-29 | Accepted | Use FastAPI, Pydantic models, and pure Python integer-cent financial functions for the backend. | Keeps authoritative calculations isolated from presentation and future AI code. |
| D-011 | 2026-10-29 | Accepted | Use Supabase Auth, Postgres migrations, explicit grants, and RLS for user-owned data. | Provides persistence and per-user authorization without bank integrations. |
| D-012 | 2026-10-29 | Accepted | Use a typed in-memory FastAPI repository for the fictional CRUD demo, returning a complete recalculated dashboard after every mutation. | Keeps milestone workflows immediately runnable while preserving a clean boundary for the future Supabase repository adapter. |
| D-013 | 2026-10-29 | Accepted | Bound each Council run to one comparison round, five deterministic tools, 700 output tokens, and 6.5 seconds. | Makes latency and cost predictable and prevents open-ended agent loops. |
| D-014 | 2026-10-29 | Accepted | Use the model only to rewrite qualitative explanations from a strict structured schema; reject model text containing quantitative claims and fall back to deterministic copy. | Keeps all financial facts traceable to tools. |
| D-015 | 2026-10-29 | Accepted | Savings-goal proposals are owner-bound, version-bound, single-use server records and are rechecked against current goal state at approval time. | Prevents cross-user approval, replay, and stale writes. |

Statuses are **Proposed**, **Accepted**, **Superseded**, or **Rejected**. Product constraints stated in the project brief are recorded as accepted; implementation choices remain proposed until the team confirms them.

## Working assumptions

- The demo's primary locale is English Canada, currency is CAD, and Canadian spelling is used.
- A single fictional user profile is sufficient for the judged MVP.
- Supabase Auth identifies local demo users; production identity assurance and regulated-data storage remain out of scope.
- XP is a motivational progress mechanic with no monetary value or redeemable reward.
- Council personas share the same verified financial snapshot and tools; their tone and focus differ, not the underlying facts.
- Credit-utilization output is educational and should avoid claims about exact credit-score impact.

## Open decisions

| ID | Needed by | Question | Default if unanswered |
| --- | --- | --- | --- |
| O-003 | Before deployment | Where will the web client and API be hosted for judging? | Managed Next.js hosting plus a small managed Python service. |
| O-005 | Before design implementation | Are there approved brand assets, colours, typefaces, or a reference design? | Accessible neutral palette and system fonts; do not invent a final brand system. |
| O-006 | Before content freeze | Who approves Canadian financial-literacy wording and disclaimers? | Plain-language educational copy reviewed by the team; avoid individualized advice. |
| O-007 | Before judging rehearsal | Will the demo require offline operation? | Provide seeded data and a scripted Council fallback for the critical path. |
| O-008 | Before shared deployment | Which Supabase JWT signing mode will the shared project use? | Configure the backend for the project's verified signing key; the public demo token remains development-only. |

## Change template

When adding a decision, include the date, status, decision, alternatives considered, reason, and consequences. Link to an issue or pull request when one exists.

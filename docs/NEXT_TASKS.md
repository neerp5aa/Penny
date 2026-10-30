# Penny Solo Developer Roadmap

This is one sequential queue for a solo developer using Codex. Finish and verify each task before starting the next. Prefer completing the current architecture over replacing it.

## Queue summary

| Order | Task | Scope | Priority | Effort | Cut if time-limited? |
| --- | --- | --- | --- | --- | --- |
| 1 | PEN-001 Secure all financial API routes | MUST HAVE | P0 | Medium | No |
| 2 | PEN-002 Add Supabase-backed demo persistence | MUST HAVE | P1 | Large | No |
| 3 | PEN-003 Correct and generalize Council decisions | MUST HAVE | P1 | Small–medium | No |
| 4 | PEN-004 Add flagship Playwright journey | MUST HAVE | P1 | Medium | No |
| 5 | PEN-005 Deploy and rehearse the MVP | MUST HAVE | P1 | Medium | No |
| 6 | PEN-006 Complete three Learn lessons and XP | SHOULD HAVE | P1 | Medium | Reduce to one lesson if necessary |
| 7 | PEN-007 Complete five Missions safely | SHOULD HAVE | P1 | Medium | Cut before the flagship flow |
| 8 | PEN-008 Make Credit an interactive calculator | SHOULD HAVE | P2 | Small | Yes |
| 9 | PEN-009 Final accessibility and demo polish | NICE TO HAVE | P2 | Medium | Yes, except critical accessibility fixes |

## PEN-001 — Secure all financial API routes

- **Priority:** P0 critical / MUST HAVE
- **Relevant files:** `backend/app/main.py`, `backend/app/auth.py`, `backend/app/dashboard_store.py`, `frontend/lib/api.ts`, `frontend/lib/supabase.ts`, `frontend/app/login/page.tsx`, backend and frontend tests.
- **Dependencies:** None.
- **Scope:** Require authenticated identity for dashboard, transaction, budget, savings-goal, and Council operations. Pass `user_id` into the repository boundary. Use the Supabase access token when available; permit the fictional demo token only under explicit development configuration. Preserve all current UI behavior and deterministic calculations.
- **Acceptance criteria:** Anonymous and invalid-token reads/writes return 401; a non-owner cannot access Maya data; the configured demo identity can complete existing dashboard CRUD and Council flows; frontend requests use one centralized bearer-token path; no token is hardcoded as an unconditional fallback.
- **Definition of done:** Backend authorization tests cover every route group; frontend token/request tests pass; lint, typecheck, unit tests, and production build pass; environment and README instructions are updated.
- **Estimated effort:** Medium.

## PEN-002 — Add Supabase-backed demo persistence

- **Priority:** P1 important / MUST HAVE
- **Relevant files:** `backend/app/dashboard_store.py` or a new repository adapter beside it, `backend/app/main.py`, `backend/app/council/proposals.py`, Supabase migrations/seed, configuration, integration tests.
- **Dependencies:** PEN-001.
- **Scope:** Implement the existing repository contract against Supabase/Postgres for users, accounts, categories, transactions, budgets, savings goals, and Council proposals. Seed one fictional Canadian demo user/data set through an explicit development procedure. Keep the in-memory adapter only as an intentional offline fallback if needed.
- **Acceptance criteria:** CRUD and approved goal changes survive API restart; every query is owner-scoped; proposal approval and goal update are atomic, versioned, auditable, expiring, and single-use; financial calculations remain in Python integer-cent tools.
- **Definition of done:** Migrations apply in a clean environment; two-user RLS/integration tests pass; a restart test proves persistence; existing API contracts and UI remain working.
- **Estimated effort:** Large.

## PEN-003 — Correct and generalize Council decisions

- **Priority:** P1 important / MUST HAVE
- **Relevant files:** `backend/app/council/orchestrator.py`, `tools.py`, `models.py`, Council tests, `frontend/components/dashboard-app.tsx`.
- **Dependencies:** PEN-001; can be done before PEN-002 if persistence work is blocked.
- **Scope:** Make claim labels and actions derive from the validated purchase and verified decision. Add explicit rule-based agent relevance and honest three-lens terminology. Keep one bounded optional LLM explanation stage; do not add open-ended autonomy.
- **Acceptance criteria:** Buy-now, save-first, and wait scenarios each produce consistent recommendations/actions; arbitrary purchase names are reflected safely; selected personas and disagreements have deterministic reasons; missing information and fallback remain correct.
- **Definition of done:** Parameterized deterministic tests cover all decisions and changed income/spending/savings; no LLM-authored monetary value can enter the response; UI renders each outcome.
- **Estimated effort:** Small to medium.

## PEN-004 — Add flagship Playwright journey

- **Priority:** P1 important / MUST HAVE
- **Relevant files:** `frontend/package.json`, new Playwright configuration/tests, test fixture/start scripts, API test setup.
- **Dependencies:** PEN-002 and PEN-003.
- **Scope:** Automate the exact phone-sized dashboard → Council → approval → updated goal journey plus one API-failure state. Use fictional seeded data and deterministic model fallback.
- **Acceptance criteria:** Test opens the dashboard, verifies $1,200 laptop scenarios and all three viewpoints, approves once, observes updated goal, reloads, and confirms persistence; replay is rejected; a failed Council request shows an accessible error.
- **Definition of done:** E2E passes locally and in CI with documented commands; no sleeps or external model dependency; screenshots/traces are retained on failure.
- **Estimated effort:** Medium.

## PEN-005 — Deploy and rehearse the MVP

- **Priority:** P1 important / MUST HAVE
- **Relevant files:** deployment manifests/configuration, environment examples, CORS settings, README, CI workflow.
- **Dependencies:** PEN-002 and PEN-004.
- **Scope:** Select managed Next.js and Python hosting, configure the shared Supabase project, production URLs/origins, JWT verification, demo seeding, health checks, and fallback model behavior.
- **Acceptance criteria:** A fresh judge URL loads on mobile; all primary actions work; no localhost URLs or development bearer token are accepted in production; health checks and logs identify failures; deterministic fallback works without a model call.
- **Definition of done:** CI runs lint/typecheck/tests/build/E2E; deployed smoke test passes; setup, rollback, and demo reset instructions are documented; backup recording is possible.
- **Estimated effort:** Medium.

## PEN-006 — Complete three Learn lessons, quizzes, and XP

- **Priority:** P1 important / SHOULD HAVE
- **Relevant files:** `supabase/seed.sql`, lesson/progress models and routes, new frontend Learn components, tests.
- **Dependencies:** PEN-002.
- **Scope:** Finish three short Canadian student lessons with one deterministic quiz each, answer explanations, progress, and idempotent XP. Reuse the existing lesson and quiz-progress schema where possible.
- **Acceptance criteria:** User can open each lesson, answer a quiz, see correct/incorrect explanation, earn XP once, reload, and retain progress.
- **Definition of done:** API authorization and RLS tests pass; duplicate submissions cannot duplicate XP; frontend loading/empty/error states and keyboard operation are covered.
- **Estimated effort:** Medium. If time is tight, deliver one excellent lesson and label the other two as post-submission rather than presenting static cards as complete.

## PEN-007 — Complete five responsible Missions

- **Priority:** P1 important / SHOULD HAVE
- **Relevant files:** new mission migration/seed, API models/routes, dashboard response, `MissionsCard`, tests.
- **Dependencies:** PEN-002 and preferably PEN-006 for shared XP rules.
- **Scope:** Add five safe predefined missions, completion state, idempotent XP awards, and persisted progress. Avoid money transfers or autonomous actions.
- **Acceptance criteria:** Five missions display; a user can complete an eligible mission once; XP and completion survive reload; repeated requests award nothing additional.
- **Definition of done:** Owner authorization, duplicate-reward, and persistence tests pass; dashboard UI exposes clear completion states.
- **Estimated effort:** Medium. Cut this before compromising the primary Council demo.

## PEN-008 — Make Credit an interactive educational calculator

- **Priority:** P2 polish / SHOULD HAVE
- **Relevant files:** deterministic finance module or typed calculation route, `CreditView`, tests.
- **Dependencies:** PEN-001; no database dependency if intentionally session-only.
- **Scope:** Let users enter fictional balance and limit, validate them, calculate integer basis-point utilization, and show responsible tier-neutral education without score predictions.
- **Acceptance criteria:** Zero/invalid limits are rejected; exact basis-point results are tested; copy clearly states educational scope; no lending recommendation is produced.
- **Definition of done:** Unit and UI tests pass with accessible labelled inputs and error messages.
- **Estimated effort:** Small. Cut if the deadline threatens must-have work.

## PEN-009 — Final accessibility and demo polish

- **Priority:** P2 polish / NICE TO HAVE
- **Relevant files:** frontend components and styles, E2E/accessibility configuration, demo documentation.
- **Dependencies:** All retained feature work complete and feature freeze reached.
- **Scope:** Phone/device pass, keyboard and screen-reader labels, contrast, focus order, reduced motion, empty/error copy, loading stability, pitch reset control, and visual consistency.
- **Acceptance criteria:** Primary flow works at common phone and desktop sizes; no critical automated accessibility violations; all interactive controls are keyboard reachable and visibly focused.
- **Definition of done:** Rehearsal checklist completed twice from clean seeded state; only critical fixes afterward.
- **Estimated effort:** Medium. Cut decorative work, not accessibility blockers.

## Immediate next Codex prompt

```text
Implement PEN-001 from docs/NEXT_TASKS.md: secure every Penny financial API route and connect frontend requests to authenticated identity.

Work within the existing Next.js + FastAPI architecture. Preserve the current DashboardStore, deterministic integer-cent calculations, Council tools, UI behavior, fictional Maya demo data, and all uncommitted work. Do not add database persistence, Learn, Missions, Credit features, deployment infrastructure, or unrelated refactors in this milestone.

Requirements:

1. Require CurrentUser authentication on GET /api/v1/dashboard and every transaction, budget, and savings-goal create/update/delete route, in addition to the existing Council routes.
2. Pass current_user.id through an owner-aware repository boundary. The in-memory demo adapter must serve only demo-maya-singh and return 403 for any other authenticated user; no financial operation may use unscoped global access from an API route.
3. Centralize frontend authenticated fetch behavior. Use the current Supabase session access token when a session exists. Allow NEXT_PUBLIC_DEMO_AUTH_TOKEN only when an explicit demo-mode environment flag is enabled; remove the unconditional source-code fallback token.
4. Keep the local fictional demo easy to run through documented environment examples. The backend demo token must remain accepted only when PENNY_ENVIRONMENT=development.
5. Preserve explicit, server-enforced Council proposal approval and all existing deterministic financial behavior.
6. Add authorization tests for dashboard reads and each CRUD route group: missing token returns 401, invalid token returns 401, another authenticated user cannot access Maya data, and the configured demo user can complete the existing workflows.
7. Add frontend request tests proving bearer-token selection and proving no token is silently invented when demo mode is disabled.
8. Update README.md, backend/.env.example, frontend/.env.example, DECISIONS.md, and docs/architecture.md only where required to describe the final authentication flow.

Acceptance criteria:

- No dashboard, transaction, budget, goal, Council, or Council-approval route can read or mutate financial state without an authenticated identity.
- A non-owner receives 403 and cannot change Maya's state.
- The configured development demo still loads and completes transaction CRUD plus the laptop Council approval flow.
- Supabase access tokens are used when signed in; demo tokens are explicitly opt-in and development-only.
- Money remains integer cents and the LLM remains explanation-only.
- Backend Ruff format/check and pytest pass.
- Frontend ESLint, strict typecheck, Vitest, and production build pass.

Do not commit, push, migrate a database, or implement PEN-002. At completion, report every modified file, the authorization design, exact commands run, test counts, failures or warnings, and any remaining risks.
```

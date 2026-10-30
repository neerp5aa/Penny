# Penny MVP Audit

Audit date: October 29, 2026  
Deadline: November 15, 2026  
Audit mode: source inspection and non-destructive verification only

## 1. Executive summary

Penny has a credible dashboard and a strong deterministic Council calculation pipeline, but it is not yet a complete or deployment-ready MVP. The frontend, API, tests, and production build all pass their configured checks. The core laptop scenario works through explicit approval and updates the visible dashboard during one FastAPI process.

The largest gap is the data boundary. Dashboard CRUD and Council read from one process-global `DashboardStore`; they do not read or write the Supabase schema. Dashboard, transaction, budget, and normal savings-goal routes are also unauthenticated. The Supabase login does not supply its access token to those routes or to Council; Council instead uses a public development token. An approved goal change reverted from $600 to $300 after an audited FastAPI restart, so the complete journey is not durably persisted.

Council is more than three chat bubbles: it has typed inputs, five deterministic tools, verification, missing-information handling, bounded execution, structured output, model failure fallback, and an approval command. It is not a genuine multi-agent debate, however. One orchestrator always selects all three personas, constructs their stances and trade-offs in code, and optionally makes one LLM request that generates all qualitative explanations. The recorded “debate round” is a counter, not an interaction among autonomous agents.

Learn, Missions, and the interactive portion of Credit remain incomplete. There is no deployment configuration or browser end-to-end suite. The recommended strategy is to secure the existing API first, then connect the current repository contract to Supabase rather than rewriting the UI or financial domain.

## 2. Feature-completion matrix

| Module / capability | Status | Evidence | MVP assessment |
| --- | --- | --- | --- |
| Dashboard totals and cash flow | Fully functional in process | `backend/app/dashboard_store.py::dashboard`; `backend/app/domain/finance.py::build_summary`; passing unit tests | Correct integer-cent aggregation for the active fixture month. |
| Transaction create/edit/delete and category assignment | Fully functional in process | `DashboardStore.create_transaction`, `update_transaction`, `delete_transaction`; dialogs in `frontend/components/dashboard-app.tsx` | UI and API contracts exist; changes recalculate totals and balances. Not authenticated or persistent. |
| Monthly budgets and category spending | Fully functional in process | `DashboardStore.dashboard`, budget CRUD routes, `CategoryChart`, `BudgetView` | Recalculation is deterministic; active month is hardcoded. |
| Account balances | Partially implemented | Fixture accounts and `_apply_account_effect` | Display and transaction effects work; no account management or database backing. |
| Responsive navigation and states | Implemented, source-verified | `DesktopSidebar`, `MobileNavigation`, `DashboardSkeleton`, `LoadError`, `EmptyState` | Build verified; no browser or device automation. |
| Database persistence | Not implemented in runtime | `dashboard_store = DashboardStore()`; API never queries Supabase | Migration exists, but application data resets on restart. |
| Council tools and verification | Fully functional in process | `backend/app/council/tools.py`; 24 passing backend tests | Five deterministic integer-cent tools produce and verify the laptop scenarios. |
| Council personas | Partially implemented | `CouncilOrchestrator.analyze` constructs Savvy, Max, and Joy | Roles are distinct but statically assembled; all are always selected. |
| Real LLM integration | Implemented but externally unverified | `OpenAIExplainer` uses the OpenAI Responses API; audited run returned `fallback_no_key` | No API key was available, so a live provider call was not verified. |
| Multi-agent orchestration/debate | UI-only representation / not genuinely implemented | Single `OpenAIExplainer.explain` call returns all persona text; no agent-to-agent loop | Bounded decision workflow is real; multi-agent debate is not. |
| Council approval gate | Fully functional in process | `GoalProposalStore.consume_for_approval`; `approve_council_goal_change` | Owner/version/replay/current-balance checks exist. Proposal and mutation are not durable. |
| Council recomputation after financial changes | Functional for in-process state | Council reloads the current store; UI `contextKey` includes income, spending, and laptop savings | Switching back to Council remounts and recalculates; goal approval triggers a rerun. No browser E2E coverage. |
| Savings-goal CRUD and progress | Fully functional in process | `DashboardStore` goal CRUD; `GoalDialog`, `GoalsCard` | Progress is deterministic. Persistence and some invariant checks are missing. |
| Monthly contribution planning | Fully functional in Council | `calculate_savings_plan` uses integer ceiling division | Verified for the laptop scenario. |
| Three Learn lessons | UI-only / incomplete | `LearnView` renders three static cards; seed contains two records | No lesson API, lesson reader, or third stored lesson. |
| Quizzes, explanations, XP | Not implemented | No API routes or frontend state; `quiz_progress` schema only | Database table alone is not usable functionality. |
| Credit utilization | Partially implemented | `DashboardStore.dashboard` calculates basis points; `CreditView` displays fixture data | Math and responsible disclaimer are present; no editable calculator. |
| Five Missions | UI-only / incomplete | `DashboardStore._missions` contains two items; `MissionsCard` only renders | No completion control, API, XP ledger, idempotency, or persistence. |
| Supabase Auth | Partially integrated | `/login` calls `signInWithPassword`; API has JWT decoding | Login session is disconnected from application API calls. |
| PostgreSQL migration and RLS | Implemented in SQL, not runtime-verified | `supabase/migrations/202610290001_initial_schema.sql` | Policies appear owner-scoped by inspection. Docker was unavailable, so migration/RLS execution was not verified. |
| Deployment | Not implemented | No hosting manifests or CI workflow; localhost defaults in environment examples | Production origins, API URL, JWT signing mode, seed process, and smoke checks are unresolved. |

## 3. Verified working functionality

The following was executed during this audit rather than inferred solely from source:

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 2 files, 5 tests.
- `npm run build` — passed with Next.js 16.4.3; `/`, `/login`, and `/api/health` were produced.
- `uv run ruff format --check .` — passed, 21 files already formatted.
- `uv run ruff check .` — passed.
- `uv run pytest` — passed: 24 tests, with one upstream Starlette TestClient deprecation warning.
- Production frontend `GET /api/health` — HTTP 200.
- API `GET /api/v1/dashboard` — HTTP 200.
- Authenticated laptop Council request — HTTP 200, decision `save_then_buy`, all three named personas, verification true, and deterministic fallback because no model key was present.
- Explicit proposal approval — HTTP 200 and laptop goal changed from 30,000 to 60,000 cents.
- Follow-up dashboard read in the same process — showed 60,000 cents.
- Fresh FastAPI process — laptop goal reverted to 30,000 cents, proving the absence of database persistence.
- A live read-only `git ls-remote` confirmed `origin/dev` at commit `6ae5110`, matching local `HEAD`.

No Playwright command was run because Playwright is not configured. Supabase migrations and RLS were not executed because Docker is not installed in the audit environment. No live OpenAI call was made because `PENNY_OPENAI_API_KEY` was unavailable.

## 4. Mocked, hardcoded, or incomplete functionality

- The financial profile, active month, accounts, categories, transactions, budgets, goals, and two missions originate from Python fixtures and process memory (`backend/app/fixtures.py`, `backend/app/dashboard_store.py`).
- `active_month` is fixed to October 2026. The frontend header and transaction date default are also fixed (`DashboardStore.active_month`, `DashboardApp`, `TransactionDialog`).
- The Council screen automatically submits a hardcoded $1,200 laptop, three-month horizon, and `goal-laptop` link. The form can change the item and price, but the server claim label remains “Laptop price” (`CouncilView`, `CouncilOrchestrator.analyze`).
- Council persona roles, headlines, assumptions, trade-offs, and recommendation actions are primarily static server text. The optional model rewrites only four qualitative explanation fields.
- `LearnView` is explicitly placeholder content and has no interaction or data connection.
- Missions are cards without buttons or mutations. Only two missions exist and one is hardcoded completed.
- Credit is a read-only fixture snapshot rather than an interactive calculator.
- `/api/v1/demo/dashboard` and `/api/v1/dashboard` are separate overlapping dashboard representations with different models, creating avoidable duplication.
- The login page reports success but does not redirect, protect the dashboard, or propagate the Supabase session to API calls.

## 5. Bugs and security findings

### F-01 — P0 critical: financial CRUD routes are unauthenticated and mutate shared global state

- **Files/functions:** `backend/app/main.py::dashboard`, all transaction/budget/goal CRUD routes; `backend/app/dashboard_store.py::dashboard_store`.
- **Evidence:** These routes have no `Depends(get_current_user)`. `frontend/lib/api.ts::request` sends no bearer token. All callers share one module-level `DashboardStore`.
- **Impact:** Any client that can reach the API can read or modify the single financial dataset. This fails the required authenticated-user isolation boundary even though the data is fictional.
- **Recommended fix:** Require `CurrentUser` on every financial route, pass `user_id` through the repository interface, reject non-demo users in the fixture adapter, and have the frontend send the current Supabase access token or an explicitly enabled development demo token.
- **Effort:** Medium.

### F-02 — P1 important: runtime persistence is disconnected from PostgreSQL

- **Files/functions:** `backend/app/dashboard_store.py`; `backend/app/main.py`; `supabase/migrations/202610290001_initial_schema.sql`.
- **Evidence:** No application module creates a Supabase/Postgres client or executes SQL. The audited approved goal reverted after API restart.
- **Impact:** Dashboard CRUD, Council proposals, approval state, sessions, and goals are lost on restart and cannot satisfy the durable demo journey.
- **Recommended fix:** Implement a Supabase-backed repository behind the existing dashboard contract, seed one fictional authenticated demo user, and persist goal proposals/audit state transactionally.
- **Effort:** Large.

### F-03 — P1 important: Supabase login and API authentication are disconnected

- **Files/functions:** `frontend/app/login/page.tsx::signIn`; `frontend/lib/api.ts::councilRequest`; `backend/app/auth.py::get_current_user`.
- **Evidence:** Login creates a browser session, but API requests never retrieve it. Council always uses `NEXT_PUBLIC_DEMO_AUTH_TOKEN` or the hardcoded fallback. Dashboard requests are anonymous.
- **Impact:** A real signed-in user does not become the API identity. The public demo token is suitable only for a controlled development demo.
- **Recommended fix:** Centralize authenticated fetch, retrieve the Supabase access token, remove the source-code fallback, and allow the demo token only when both client and server explicitly enable demo mode.
- **Effort:** Medium.

### F-04 — P1 important: Council is not a genuine multi-agent system

- **Files/functions:** `backend/app/council/orchestrator.py::CouncilOrchestrator.analyze`; `backend/app/council/llm.py::OpenAIExplainer.explain`.
- **Evidence:** All three agents are always selected. One model call returns all three reasoning fields and one comparison. There is no separate agent state, tool selection, response comparison, or debate loop; `debate_rounds_used` is derived from tool count.
- **Impact:** Describing this as multi-agent debate would overstate the implementation to judges. It is a deterministic orchestrator with three lenses.
- **Recommended fix:** For MVP scope, describe it honestly as a verified three-lens Council. If agentic behavior is essential to judging, add explicit rule-based agent selection and separate bounded qualitative responses, then deterministically compare them; do not add open-ended autonomy.
- **Effort:** Medium.

### F-05 — P1 important: recommended action text can contradict the calculated decision

- **Files/functions:** `backend/app/council/orchestrator.py::CouncilOrchestrator.analyze`.
- **Evidence:** The first action is always “Use the save-first scenario,” even when `decision` is `buy_now` or `wait`. The first quantitative claim is always labelled “Laptop price” for arbitrary form input.
- **Impact:** Users can receive internally inconsistent guidance despite correct calculations.
- **Recommended fix:** Generate actions and labels from the verified decision and validated purchase name; add parameterized tests for `buy_now`, `save_then_buy`, and `wait`.
- **Effort:** Small.

### F-06 — P1 important: Learn is not an end-to-end feature

- **Files/functions:** `frontend/components/dashboard-app.tsx::LearnView`; `supabase/seed.sql`; `quiz_progress` migration.
- **Evidence:** Three UI cards are static, only two lessons are seeded, and there are no lesson/quiz API routes, answer explanations, XP calculation, or progress UI.
- **Impact:** The stated financial literacy success criterion cannot be demonstrated.
- **Recommended fix:** Complete three concise seeded lessons with one quiz each, deterministic answer validation/explanations, idempotent XP, and progress persistence after the primary demo path is durable.
- **Effort:** Medium.

### F-07 — P1 important: Missions are display-only and incomplete

- **Files/functions:** `backend/app/dashboard_store.py::DashboardStore.__init__`; `frontend/components/dashboard-app.tsx::MissionsCard`.
- **Evidence:** Two missions exist instead of five. Cards have no completion action. There is no missions table, endpoint, XP ledger, duplicate-reward guard, or persistence.
- **Impact:** Mission completion and XP cannot be demonstrated.
- **Recommended fix:** Add five safe predefined missions and one idempotent completion endpoint with persisted awarded XP. Keep mission logic deterministic.
- **Effort:** Medium.

### F-08 — P1 important: no browser end-to-end coverage for the flagship journey

- **Files/functions:** `frontend/package.json`; existing `frontend/lib/*.test.ts`; `backend/tests/test_council.py`.
- **Evidence:** Vitest covers money helpers and one fetch contract; backend tests mostly call stores/tools directly. There is no Playwright configuration or browser workflow test.
- **Impact:** Navigation, dialogs, loading states, API wiring, responsive behavior, and post-approval dashboard rendering can regress while all current tests pass.
- **Recommended fix:** Add one Playwright happy-path test and one API-failure test for the exact demo journey after persistence/auth are stable.
- **Effort:** Medium.

### F-09 — P1 important: deployment is not defined or rehearsable

- **Files/functions:** `frontend/next.config.ts`, environment examples, repository root.
- **Evidence:** No deployment manifests or CI workflow exist. API URL and CORS default to localhost. JWT signing mode and demo seed process are open decisions.
- **Impact:** A passing local build does not establish a judge-accessible deployment.
- **Recommended fix:** Select hosting, configure production origins/URLs and health checks, document Supabase JWT validation and demo seeding, then run a deployed smoke test.
- **Effort:** Medium.

### F-10 — P1 important: RLS and Supabase migrations are unverified

- **Files/functions:** `supabase/migrations/202610290001_initial_schema.sql` policies and grants.
- **Evidence:** Owner-scoped policies and explicit grants look correct by inspection. Docker is unavailable, so `supabase db reset` and two-user RLS tests could not run.
- **Impact:** Syntax, trigger behavior, grants, and cross-user denial are not proven in a real Postgres instance.
- **Recommended fix:** Run migrations in CI or a local Docker environment and add SQL/integration tests for anonymous denial and two-user isolation.
- **Effort:** Small to medium.

### F-11 — P2 polish: Credit is educational but not a calculator

- **Files/functions:** `backend/app/dashboard_store.py::dashboard`; `frontend/components/dashboard-app.tsx::CreditView`.
- **Evidence:** Utilization is correctly calculated with integer basis points and displayed with a responsible disclaimer, but balance and limit cannot be changed.
- **Impact:** It only partially meets the module description.
- **Recommended fix:** Add local validated inputs or a typed calculation endpoint after must-have work; never predict a credit score.
- **Effort:** Small.

### F-12 — P2 polish: goal invariants are incomplete

- **Files/functions:** `backend/app/dashboard_models.py::GoalWrite`, `GoalPatch`; `DashboardStore.create_goal`, `update_goal`.
- **Evidence:** `current_cents` may exceed `target_cents`; direct edits do not automatically align `status` with progress. Council approval does cap and complete a goal.
- **Impact:** Goal UI can show capped 100% progress while retaining inconsistent stored values/status.
- **Recommended fix:** Enforce `current_cents <= target_cents` and deterministic status transitions in the domain/repository with boundary tests.
- **Effort:** Small.

### F-13 — P2 polish: proposal lifecycle is process-local and has failure/expiry gaps

- **Files/functions:** `backend/app/council/proposals.py::GoalProposalStore`; `approve_council_goal_change`.
- **Evidence:** Proposals never expire and accumulate until restart. They are marked consumed before the goal mutation; a stale mutation failure leaves the proposal permanently consumed. No persisted audit record exists.
- **Impact:** Safe replay prevention exists, but resilience and auditability are incomplete.
- **Recommended fix:** Persist proposals with owner, expiry, expected version, status, and applied timestamp; consume and mutate in one transaction.
- **Effort:** Medium, best included with persistence.

### F-14 — P2 polish: overlapping dashboard models and endpoints add maintenance risk

- **Files/functions:** `backend/app/models.py::DemoDashboardResponse`; `backend/app/dashboard_models.py::DashboardResponse`; `/api/v1/demo/dashboard`; `/api/v1/dashboard`.
- **Evidence:** Two fixture-oriented response shapes represent similar data and use separate calculation paths.
- **Impact:** Values or behavior can diverge and tests may validate the legacy path instead of the UI path.
- **Recommended fix:** After the demo path is stable, retire or clearly isolate the legacy demo endpoint; do not perform a broad rewrite before the deadline.
- **Effort:** Small.

### F-15 — P2 polish: live provider behavior is not verified

- **Files/functions:** `backend/app/council/llm.py::OpenAIExplainer.explain`.
- **Evidence:** The adapter is real and structured, but the audited request returned `fallback_no_key`. Existing tests inject failure rather than exercising a mocked successful SDK response.
- **Impact:** SDK/schema compatibility and the `llm_status="used"` path are unproven.
- **Recommended fix:** Add a mocked successful Responses API contract test and perform one controlled staging smoke test with fictional data and a real key.
- **Effort:** Small.

## 6. Financial correctness and security assessment

- Monetary storage and calculations use Python integers or frontend `BigInt`; editable CAD is converted to a safe integer before API submission.
- Transaction amounts are unsigned magnitudes and `kind` controls direction consistently. Credit-account direction is handled separately in `_apply_account_effect`.
- Category spending, budget remaining, cash flow, savings contributions, savings plan ceiling division, and credit utilization basis points are deterministic.
- LLM output is not authoritative. It receives verified facts, cannot invoke tools, is schema-validated, and is rejected if it contains digits or currency words. Quantitative UI claims come from server tools.
- Council approval checks authentication, proposal owner, version, replay state, expected current goal value, and contribution positivity.
- Supabase RLS policies are owner-scoped by source inspection, but the application does not use those tables and the policies were not executed in this environment.
- No committed secrets were detected. `.env` variants are ignored and examples contain placeholders. The development bearer token is intentionally public and must not be accepted outside development.
- The critical exception is the unauthenticated non-Council API surface described in F-01.

## 7. Missing tests

- Browser E2E test for dashboard → Council → approval → updated goal.
- API authentication tests for every dashboard and CRUD route.
- Supabase migration and two-user RLS integration tests.
- Persistence-across-restart test using the actual database adapter.
- Parameterized Council decision tests for buy-now and wait outcomes, not only save-first.
- Successful structured LLM response contract test, numeric-output rejection test, timeout test, and overall 504 test.
- Concurrency test for two simultaneous approvals.
- Goal invariant tests for current greater than target and status transitions.
- Frontend component tests for dialogs, missing information, API errors, loading, and approval UI.
- Accessibility automation and phone-sized viewport coverage.
- Learn quiz, XP idempotency, and Mission duplicate-reward tests once those features exist.

## 8. Deployment blockers

1. Financial routes are unauthenticated.
2. Runtime data and proposals are not persisted.
3. Supabase browser sessions are not connected to FastAPI identity.
4. JWT signing mode for the shared Supabase project is unresolved; backend validation currently supports HS256 shared-secret tokens only.
5. No production host configuration, CI pipeline, production CORS value, seed procedure, or deployed smoke test exists.
6. Database migrations/RLS have not been executed in the audited environment.
7. A live model call has not been verified; deterministic fallback is working and should remain the demo backup.

## 9. Demo journey status

| Step | Result | Evidence |
| --- | --- | --- |
| 1. Open Penny | Verified at health/build level | Production frontend health returned 200; no browser E2E was available. |
| 2. View fictional Canadian student dashboard | Verified through API and source | Maya Singh fixture and dashboard endpoint returned data; UI consumes that endpoint. |
| 3. Ask about a $1,200 laptop | Verified through live API | Authenticated request returned HTTP 200. |
| 4. Show Savvy, Max, and Joy | Verified output, not independent agents | Response included all three fixed lenses. |
| 5. Show verified scenarios and assumptions | Verified through live API | Verification true; buy-now, save-first, and unchanged scenarios returned. |
| 6. Recommend realistic savings plan | Verified through live API | `save_then_buy`; 30,000 cents per month over three months. |
| 7. Ask for explicit approval | Verified through API/UI source | Proposal was inert until the approval endpoint was called. |
| 8. Save approved goal | **Fails durable persistence** | Goal became 60,000 cents in process, then reverted to 30,000 cents after restart. |
| 9. Show updated goal | Verified only in the same process | Follow-up dashboard read showed 60,000 cents; UI consumes the returned dashboard snapshot. |

**Conclusion:** The dashboard-to-Council-to-goal flow is demonstrable in one uninterrupted local process and uses real deterministic application logic. It does not yet satisfy a persisted end-to-end journey, authenticated application boundary, or browser-verified deployment.

## 10. Architectural concerns and scope control

### Must have before submission

- Authenticate every financial API operation and connect browser identity to FastAPI.
- Persist the dashboard data needed by the demo and Council-approved goal changes.
- Fix Council recommendations so actions match all possible decisions.
- Add one automated flagship browser journey.
- Configure and rehearse a deployed environment.

### Should have

- Three concise Learn lessons with quizzes, explanations, and idempotent XP.
- Five completable Missions with duplicate-reward protection.
- Execute RLS tests and add a controlled live-model smoke test.
- Add an editable educational credit-utilization calculator.

### Nice to have

- Additional Council animation, avatar art, richer charts, more scenarios, and visual polish.
- Broader accessibility automation beyond the critical journey.
- Cleanup of the duplicate legacy dashboard response.

### Post-MVP / cut now

- Real bank connections, payments, investment tracking, recurring-transaction prediction, production billing, open-ended agent autonomy, complex forecasting, and a broad architecture rewrite.
- If time becomes limited, cut interactive Credit enhancements and advanced agent debate first. Keep deterministic Council, the durable approval journey, and at least one compact Learn interaction.

## 11. Recommended next steps

The sequential implementation queue is maintained in `docs/NEXT_TASKS.md`. The immediate task is to secure the current financial API and connect frontend requests to the authenticated identity without changing the financial domain or adding new features. This removes the P0 boundary failure and creates the required seam for persistent per-user storage.

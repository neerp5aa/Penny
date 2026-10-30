# Penny Architecture

## Milestone 1 system

```text
Next.js App Router client
  |-- mobile-first Tailwind + shadcn/ui dashboard
  |-- loading, empty, error, and mutation states
  |-- Supabase Auth browser client
  |-- GET /api/health
  |
  +---- HTTPS JSON ----> FastAPI
  |                       |-- Pydantic response models
  |                       |-- deterministic Python financial domain
  |                       |-- fictional in-memory CRUD repository
  |                       |-- authenticated, bounded Penny AI coach
  |                       |     |-- five deterministic financial tools
  |                       |     |-- verified structured recommendations
  |                       |     +-- optional OpenAI explanation adapter
  |                       +-- owner-bound approval command
  |
  +---- Supabase client -> Auth + Postgres
                          |-- versioned migrations
                          |-- explicit grants and RLS policies
                          +-- fictional lesson seeds
```

The Council session table reserves ownership and lifecycle metadata. The hackathon runtime keeps short-lived proposals in process; it stores no prompts or model output in Supabase.

## Boundaries

- `frontend/` owns presentation, accessibility, Supabase sign-in, and mutation forms. It never calculates financial totals; editable CAD strings are converted to cents with `BigInt` before requests.
- `backend/app/domain/finance.py` is the authoritative calculation layer. Pure functions accept and return Python integers representing cents.
- `backend/app/dashboard_store.py` owns the fictional demo state and returns a complete authoritative snapshot after each create, update, or delete. Its state resets when the process restarts.
- `backend/app/main.py` exposes typed health, dashboard, calculation, CRUD, Penny AI, and approval responses. Every financial endpoint validates the bearer identity (Supabase JWT via JWKS, or the development-only demo token) and passes the user id to the store, which rejects non-owners with 403.
- `backend/app/coach/` owns the financial snapshot, check-in signals, deterministic tools, prompt-injection filtering, number grounding, provider fallback, and single-use goal proposals. Provider output cannot mutate state.
- `supabase/migrations/` owns schema evolution. The browser receives only the publishable key; service-role credentials must remain server-side.

## Database model and authorization

Supabase Auth owns credentials. An `auth.users` insert trigger creates a matching `public.users` profile. User-owned tables are `financial_accounts`, `transactions`, `categories`, `budgets`, `savings_goals`, `quiz_progress`, and `council_sessions`. `lessons` is shared read-only educational content.

Every exposed table has RLS enabled. Anonymous access is revoked. Authenticated users receive only the operations the app needs, and separate select/insert/update/delete policies compare indexed `user_id` columns with `(select auth.uid())`. The profile table is select/update only; published lessons are select only.

All stored money columns use Postgres `bigint` cents with non-negative constraints. Transaction direction is a separate enum-like field, avoiding ambiguous signed storage. Currency is constrained to CAD for the MVP.

## Deterministic flow

1. Validate typed source records and reject booleans, non-integers, or negative monetary magnitudes.
2. Sum income and spending independently with integer arithmetic.
3. Calculate cash flow as income minus spending and budget remaining as limit minus spending; negative results deliberately represent overspending.
4. Return typed cents. Formatting happens only in the UI and never becomes calculation input.

The tested edge cases include no activity, overspending, invalid values, exact savings contributions, and integers beyond JavaScript's safe-number range.

## Demo data

Maya Singh is a clearly fictional 20-year-old Dalhousie University student in Halifax. Her accounts, transactions, budgets, goals, and missions originate in the backend fixture only. The frontend receives them through the dashboard contract and does not provide fallback balances or totals.

## Health and failure behaviour

- `GET http://localhost:3000/api/health` verifies the Next.js runtime.
- `GET http://localhost:8000/health` verifies FastAPI and its typed response contract.
- If FastAPI is unavailable, the dashboard shows a retryable error instead of inventing fallback financial values.
- The login page disables sign-in and explains configuration when Supabase public environment variables are absent.
- If the model key is absent, a model call fails or times out, or a reply quotes a figure that is not in the verified set after one revision, Penny AI returns a built-in answer assembled from the same deterministic signals.

## Penny AI request and approval flow

```text
Authenticated chat request (up to 12 messages, last one a user question)
  -> reject prompt-control instructions in the question
  -> load the caller's current month and the three prior months
  -> build the verified snapshot; register every amount and ratio in a FactBook
  -> model loop (at most 5 tool rounds): the model may call deterministic tools
       check_affordability, plan_savings, compare_payment_options, project_goal,
       simulate_spending_cut, credit_card_payment, list_transactions,
       propose_goal_contribution, propose_budget_limit
     each tool parses user-typed amounts, computes in integer cents, and registers results
  -> grounding check: every $ amount and % in the reply must match a verified figure
       or an amount the user typed; one revision is allowed, then built-in fallback
  -> return reply, cited figures, tools used, provenance, and any inert proposal

Explicit approval
  -> re-authenticate caller
  -> verify proposal owner, version, single-use state, and that the goal balance or
     budget limit has not changed since the proposal
  -> apply the predetermined integer-cent change and return a fresh dashboard
```

The model never calculates. It may quote figures that deterministic code produced, and it can only change data by preparing a proposal that the user must approve. A reply is bounded by `PENNY_COACH_TIMEOUT_SECONDS` (default 45) across all tool rounds.

## Next architecture increment

Replace the in-memory dashboard and proposal repositories with authenticated Supabase adapters while preserving the existing response contracts. Persist proposal ownership, expected goal version, expiry, application timestamp, and an audit event; keep approval as the only mutation path for Penny AI suggestions.

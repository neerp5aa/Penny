# Penny

**Make money, make sense.** Penny is a mobile-first financial literacy and budgeting MVP for Canadian students and young adults. Every profile, account, transaction, and balance in this repository is fictional.

The app has seven sections:

- **Today (home):** total cash with trend, safe to spend, credit used, monthly savings against goals, a spending overview with a "vs last month" tip, recent transactions, upcoming bills, financial health with the daily Money Score, Penny AI prompts, and a learning streak.
- **Spending:** budgets, needs versus wants, auto-categorized transactions with CSV export, and 6- or 12-month trends.
- **Recurring:** bills set up once (auto-paid on their due date, or marked paid yourself), the fixed monthly total, suggestions from repeating charges, and due-date reminders.
- **Goals:** savings goals with the monthly amount needed to hit each target date.
- **Invest:** education only. A foundations checklist, TFSA, RRSP and FHSA explained with 2026 limits, and a compounding-and-fees explorer.
- **Learn:** short lessons with quizzes on budgeting, saving, tax, credit and investing, plus XP, levels, a learning streak and challenges.
- **Penny AI:** a money coach grounded in the user's verified numbers.

Every score, total and projection comes from deterministic integer-cent Python. Bank, brokerage and credit-bureau connections remain intentionally out of scope; Settings explains the standards a future bank connection would have to meet.

The dashboard loads all financial values from FastAPI. Transaction, category-assignment, monthly-budget, and savings-goal mutations return a freshly calculated dashboard snapshot. The current hackathon repository is fictional and in-memory, so CRUD changes reset when FastAPI restarts; the Supabase schema is the next persistence adapter.

## Requirements

- Node.js 20.9 or newer and npm
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)
- Supabase CLI and Docker Desktop for the local database/Auth stack

## Local setup

### 1. Supabase

```bash
supabase start
supabase db reset
```

`db reset` applies `supabase/migrations` and the fictional lesson seed to the local-only database. It deletes existing data in the local Supabase instance; never point this command at a shared or production project.

Copy the local API URL and publishable key printed by `supabase status` into the frontend environment file:

```bash
cp frontend/.env.example frontend/.env.local
```

Create a fictional development user through local Supabase Studio at `http://127.0.0.1:54323`. The Auth trigger creates the matching `public.users` record, and RLS restricts all owned financial rows to that user.

### 2. FastAPI

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Check `http://localhost:8000/health` and interactive API documentation at `http://localhost:8000/docs`.

How the daily Money Score works: fixed recurring charges are excluded. Each day earns up to 60 points for month-to-date flexible spending against the pro-rated flexible budget, and up to 40 for that day's flexible spending against the daily allowance. Zones follow WHOOP's bands: green 67–100, yellow 34–66, red 0–33. See `backend/app/domain/money_days.py`.

Other routes: `GET /api/v1/categorize?description=…` (rule-based category and need/want suggestion), `POST /api/v1/lessons/{id}/complete` (idempotent XP), `POST /api/v1/calculations/growth` (illustrative compounding with fees), `/api/v1/bills` (create, update, delete, and `/{id}/mark-paid`), `PUT /api/v1/pay-schedule`, `/api/v1/categories` and `/api/v1/accounts` (customization), and `POST /api/v1/transactions/import` (CSV history).

Dashboard and CRUD routes are under `/api/v1/dashboard`, `/api/v1/transactions`, `/api/v1/budgets`, and `/api/v1/savings-goals`. Add `?month=YYYY-MM-01` to view or return a past month. History is `GET /api/v1/history?start=…&end=…`; other additions are `POST /api/v1/budgets/copy`, `POST /api/v1/savings-goals/{id}/contributions`, `POST /api/v1/missions/{id}/complete`, and the stateless `POST /api/v1/calculations/credit-utilization`.

Penny AI is a money coach that knows the user's numbers. Its routes are `GET /api/v1/coach/brief` (a deterministic monthly check-in with no model call), `POST /api/v1/coach/chat` (a multi-turn conversation of up to 12 messages), and `POST /api/v1/coach/proposals/{id}/approve`. `GET /api/v1/me` echoes the verified identity for checking sign-in.

How an answer is produced:

1. The backend builds a verified snapshot of the user's month: budgets, spending by category against a 3-month average, bills, goals, accounts, credit use, and recent transactions. Every amount in it is formatted by deterministic integer-cent code and recorded as a verified figure.
2. The model reads the snapshot and conversation and can call deterministic tools: affordability, savings plans, upfront-versus-monthly comparisons, goal projections, spending-cut what-ifs, card-payment what-ifs, and transaction lookups. Tools receive amounts as the text the user typed and do all the arithmetic.
3. Every dollar amount and percentage in the reply must match a verified figure or an amount the user typed. If one doesn't, the model gets one chance to revise; otherwise Penny returns a built-in answer from the same data.
4. Suggested budget or goal changes are returned as single-use, version-checked proposals. Nothing changes until the user taps Approve.

To enable model-generated answers, create an OpenAI project API key and put it only in `backend/.env`:

```dotenv
PENNY_OPENAI_API_KEY=your_secret_key_here
PENNY_OPENAI_MODEL=gpt-6.1-sol
PENNY_COACH_TIMEOUT_SECONDS=45
```

Restart FastAPI after changing the environment file. AI answers are labelled with the model and response time. Without a key, or if the model fails, times out, or quotes an unverifiable number, the reply is labelled `Built-in answer` and is assembled from the deterministic check-in signals. Never put this key in `frontend/.env.local` or commit it to source control.

### Authentication

Every financial route (dashboard, transactions, budgets, savings goals, Penny AI, and approval) requires `Authorization: Bearer <token>`. Missing or invalid tokens return 401; an authenticated user who does not own the data receives 403. Only the stateless `POST /api/v1/calculations/summary` and `/health` are public.

- **Supabase (default):** the browser signs in with the publishable key and sends the session access token. FastAPI verifies it against `PENNY_SUPABASE_URL/auth/v1/.well-known/jwks.json` (ES256 or RS256, cached for ten minutes), and checks the issuer, `aud=authenticated`, `role=authenticated`, expiry, and subject. `PENNY_SUPABASE_JWT_SECRET` is only for legacy HS256 projects.
- **Fictional data owner:** until PEN-002 adds per-user persistence, the in-memory Maya data set is available only to the Supabase user whose UUID is in `PENNY_DEMO_OWNER_USER_ID`. Other signed-in users receive 403.
- **Offline demo (development only):** set `PENNY_DEMO_AUTH_TOKEN` in the backend plus `NEXT_PUBLIC_DEMO_MODE=true` and the same `NEXT_PUBLIC_DEMO_AUTH_TOKEN` in the frontend. The backend refuses to start if a demo token is configured outside `PENNY_ENVIRONMENT=development`, and the frontend never invents a token.

The backend reads `.env` and then `.env.local`. No secret or service-role key is used anywhere.

### 3. Next.js

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend health endpoint is `http://localhost:3000/api/health`; `/login` signs in with Supabase email and password, then returns to the dashboard. Without a session (or explicit demo mode), the dashboard shows a sign-in prompt instead of financial data.

## Verification

Automated verification is intentionally deferred during the active redesign phase. The Python modules in `backend/app/domain/finance.py` and `backend/app/coach/calculations.py` remain the authoritative financial calculation layer. Amounts are integer cents, and the frontend converts editable decimal strings to cents without floating-point money arithmetic. Run lint, type checking, builds, and end-to-end checks during the final verification phase before release.

## Repository map

```text
frontend/             Next.js, Tailwind CSS, shadcn/ui components, Supabase Auth client
backend/              FastAPI, Pydantic models, deterministic financial domain (app/domain), Penny AI (app/coach)
supabase/migrations/  Postgres schema, Auth trigger, grants, indexes, and RLS policies
supabase/seed.sql     Fictional educational content
docs/architecture.md  System boundaries and data flow
```

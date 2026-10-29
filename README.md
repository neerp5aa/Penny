# Penny

**Make money, make sense.** Penny is a mobile-first financial literacy and budgeting MVP for Canadian students and young adults. Every profile, account, transaction, and balance in this repository is fictional.

The current MVP includes a Next.js dashboard, a typed FastAPI service, deterministic integer-cent calculations, Supabase Auth/RLS migrations, and Penny Council. Bank connections remain intentionally out of scope.

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

Dashboard and CRUD routes are under `/api/v1/dashboard`, `/api/v1/transactions`, `/api/v1/budgets`, and `/api/v1/savings-goals`.

Council routes are `POST /api/v1/council/analyze` and `POST /api/v1/council/proposals/{id}/approve`. In local development they accept the fictional bearer token from `PENNY_DEMO_AUTH_TOKEN`. Set `PENNY_SUPABASE_JWT_SECRET` to validate Supabase JWTs instead. `PENNY_OPENAI_API_KEY` is optional: without it, or if the model fails, Council returns the same verified calculations with deterministic explanatory copy. The model key is server-side only.

### 3. Next.js

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend health endpoint is `http://localhost:3000/api/health`; `/login` exercises Supabase password authentication when environment variables are configured. The dashboard remains available in clearly labelled fictional demo mode without Supabase.

## Verification

```bash
cd frontend
npm run lint
npm run typecheck
npm test
npm run build

cd ../backend
uv run ruff format --check .
uv run ruff check .
uv run pytest
```

The Python modules in `backend/app/domain/finance.py` and `backend/app/council/tools.py` are the authoritative financial calculation layer. Amounts are integer cents; tests cover income, spending, budget remaining, savings contributions, affordability, savings plans, empty inputs, invalid values, overspending, and very large integers. The frontend converts editable decimal strings to cents without using floating-point money arithmetic.

## Repository map

```text
frontend/             Next.js, Tailwind CSS, shadcn/ui components, Supabase Auth client
backend/              FastAPI, Pydantic models, deterministic financial domain, pytest
supabase/migrations/  Postgres schema, Auth trigger, grants, indexes, and RLS policies
supabase/seed.sql     Fictional educational content
docs/architecture.md  System boundaries and data flow
```

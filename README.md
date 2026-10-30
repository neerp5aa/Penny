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

Dashboard and CRUD routes are under `/api/v1/dashboard`, `/api/v1/transactions`, `/api/v1/budgets`, and `/api/v1/savings-goals`. Add `?month=YYYY-MM-01` to view or return a past month. History is `GET /api/v1/history?start=…&end=…`; other additions are `POST /api/v1/budgets/copy`, `POST /api/v1/savings-goals/{id}/contributions`, `POST /api/v1/missions/{id}/complete`, and the stateless `POST /api/v1/calculations/credit-utilization`.

Council routes are `POST /api/v1/council/analyze` and `POST /api/v1/council/proposals/{id}/approve`. `GET /api/v1/me` echoes the verified identity for testing sign-in. `PENNY_OPENAI_API_KEY` is optional: without it, or if the model fails, Council returns the same verified calculations with deterministic explanatory copy. The model key is server-side only.

### Authentication

Every financial route (dashboard, transactions, budgets, savings goals, Council, and approval) requires `Authorization: Bearer <token>`. Missing or invalid tokens return 401; an authenticated user who does not own the data receives 403. Only the stateless `POST /api/v1/calculations/summary` and `/health` are public.

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

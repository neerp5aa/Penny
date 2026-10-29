create extension if not exists pgcrypto with schema extensions;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  province_code text not null default 'NS' check (province_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'CAD' check (currency_code = 'CAD'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  account_type text not null check (account_type in ('chequing', 'savings', 'credit')),
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  currency_code text not null default 'CAD' check (currency_code = 'CAD'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  colour_token text not null default 'slate',
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  description text not null check (char_length(description) between 1 and 160),
  transaction_kind text not null check (transaction_kind in ('income', 'spending')),
  amount_cents bigint not null check (amount_cents >= 0),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id) on delete cascade,
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null,
  month_start date not null check (date_trunc('month', month_start)::date = month_start),
  limit_cents bigint not null check (limit_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month_start),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete cascade
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  target_cents bigint not null check (target_cents > 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null,
  content jsonb not null default '{}'::jsonb,
  xp_reward integer not null default 0 check (xp_reward between 0 and 1000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quiz_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  completed boolean not null default false,
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table public.council_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  advisor text check (advisor is null or advisor in ('savvy', 'max', 'joy')),
  status text not null default 'not_started' check (status in ('not_started', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_accounts_user_id_idx on public.financial_accounts(user_id);
create index categories_user_id_idx on public.categories(user_id);
create index transactions_user_id_idx on public.transactions(user_id);
create index transactions_account_id_idx on public.transactions(account_id);
create index budgets_user_id_idx on public.budgets(user_id);
create index savings_goals_user_id_idx on public.savings_goals(user_id);
create index quiz_progress_user_id_idx on public.quiz_progress(user_id);
create index council_sessions_user_id_idx on public.council_sessions(user_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name, province_code, currency_code, is_demo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Penny learner'),
    coalesce(nullif(new.raw_user_meta_data ->> 'province_code', ''), 'NS'),
    'CAD',
    coalesce(new.raw_user_meta_data ->> 'is_demo', 'false') = 'true'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.users enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_progress enable row level security;
alter table public.council_sessions enable row level security;

revoke all on table public.users, public.financial_accounts, public.transactions, public.categories, public.budgets, public.savings_goals, public.lessons, public.quiz_progress, public.council_sessions from anon, authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update, delete on public.financial_accounts, public.transactions, public.categories, public.budgets, public.savings_goals, public.quiz_progress, public.council_sessions to authenticated;
grant select on public.lessons to authenticated;

create policy "users_select_own" on public.users for select to authenticated using ((select auth.uid()) = id);
create policy "users_update_own" on public.users for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "accounts_select_own" on public.financial_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "accounts_insert_own" on public.financial_accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "accounts_update_own" on public.financial_accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_delete_own" on public.financial_accounts for delete to authenticated using ((select auth.uid()) = user_id);

create policy "transactions_select_own" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "categories_select_own" on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "budgets_select_own" on public.budgets for select to authenticated using ((select auth.uid()) = user_id);
create policy "budgets_insert_own" on public.budgets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "budgets_update_own" on public.budgets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "budgets_delete_own" on public.budgets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "goals_select_own" on public.savings_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.savings_goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.savings_goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals_delete_own" on public.savings_goals for delete to authenticated using ((select auth.uid()) = user_id);

create policy "lessons_read_published" on public.lessons for select to authenticated using (published);

create policy "quiz_select_own" on public.quiz_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "quiz_insert_own" on public.quiz_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "quiz_update_own" on public.quiz_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quiz_delete_own" on public.quiz_progress for delete to authenticated using ((select auth.uid()) = user_id);

create policy "council_select_own" on public.council_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "council_insert_own" on public.council_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "council_update_own" on public.council_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "council_delete_own" on public.council_sessions for delete to authenticated using ((select auth.uid()) = user_id);

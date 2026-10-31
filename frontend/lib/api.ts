import { getSupabaseAccessToken } from "./supabase";

export type AccountType = "chequing" | "savings" | "credit" | "cash" | "investment" | "other";
export type Account = { id: string; name: string; account_type: AccountType; balance_cents: number; credit_limit_cents: number | null };
export type Category = { id: string; name: string; colour_token: string; kind: "income" | "spending"; parent_id: string | null; custom: boolean };
export type Transaction = { id: string; description: string; category: string; account_id: string; category_id: string | null; amount_cents: number; kind: "income" | "spending"; occurred_on: string; necessity: "need" | "want" | null; auto_categorized: boolean; bill_id: string | null; paid_automatically: boolean | null };
export type Budget = { id: string; category_id: string; category_name: string; month_start: string; limit_cents: number; spent_cents: number; remaining_cents: number; usage_basis_points: number; carried_over: boolean };
export type GoalContribution = { id: string; amount_cents: number; from_account_id: string; to_account_id: string | null; occurred_on: string; source: "you" | "penny" };
export type SavingsGoal = { id: string; name: string; target_cents: number; current_cents: number; target_date: string | null; status: "active" | "completed" | "paused"; progress_basis_points: number; monthly_needed_cents: number | null; account_id: string | null; contributed_this_month_cents: number; recent_contributions: GoalContribution[] };
export type Mission = { id: string; title: string; description: string; xp_reward: number; completed: boolean };
export type CategorySpending = { category_id: string | null; category_name: string; colour_token: string; spent_cents: number; share_basis_points: number };
export type FinancialHealthFactor = { id: string; label: string; score: number; max_score: number; explanation: string };
export type MonthPoint = { month: string; value: number };
export type FinancialHealth = { score: number; history: MonthPoint[]; factors: FinancialHealthFactor[]; methodology: string; limitations: string[] };
export type Zone = "green" | "yellow" | "red";
export type MoneyDay = { day: string; future: boolean; score: number | null; zone: Zone | null; pace_points: number | null; day_points: number | null; flexible_spent_cents: number; total_spent_cents: number; income_cents: number; transaction_count: number; due: string[] };
export type MoneyCalendar = {
  month: string;
  today: string | null;
  today_score: number | null;
  today_zone: Zone | null;
  flexible_budget_cents: number;
  daily_allowance_cents: number;
  days: MoneyDay[];
  streaks: { current_green: number; best_green: number; no_spend_days: number; green_days: number; scored_days: number };
  methodology: string;
};
export type BillFrequency = "weekly" | "biweekly" | "monthly" | "yearly";
export type Bill = { id: string; name: string; amount_cents: number; category_id: string | null; account_id: string; frequency: BillFrequency; next_due: string; auto_record: boolean; last_paid_on: string | null };
export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "custom";
export type PaySchedule = { name: string; amount_cents: number; account_id: string; frequency: PayFrequency; next_payday: string; interval_days: number | null };
export type RecurringExpense = { id: string; name: string; category_name: string | null; amount_cents: number; monthly_cents: number; frequency: BillFrequency; next_due: string; days_until_due: number; kind: "bill" | "subscription"; auto_record: boolean; last_paid_on: string | null; payment_count: number };
export type RecurringSuggestion = { name: string; category_id: string | null; amount_cents: number; next_due: string };
export type RecurringSummary = { items: RecurringExpense[]; suggestions: RecurringSuggestion[]; fixed_monthly_cents: number; subscriptions_monthly_cents: number; due_next_7_days_cents: number; due_before_payday_cents: number; share_of_income_basis_points: number | null; methodology: string };
export type BillHistory = { bill: Bill; payments: Transaction[]; payment_count: number; total_paid_cents: number; paid_this_year_cents: number; average_cents: number; auto_paid_count: number };
export type LessonTrack = "budgeting" | "saving" | "tax" | "credit" | "investing";
export type Lesson = { id: string; track: LessonTrack; title: string; xp_reward: number; completed: boolean };
export type LearningProgress = { xp_total: number; level: number; level_xp: number; level_size_xp: number; streak_days: number; completed_today: boolean; week_activity: boolean[]; next_lesson: Lesson | null; lessons: Lesson[] };
export type FoundationCheck = { id: string; title: string; status: "met" | "in_progress" | "not_met"; detail: string };
/** The date range a dashboard covers. `phrase` reads after a verb: "spent $X this month". */
export type Period = { start: string; end: string; label: string; phrase: string; single_month: boolean; month_count: number };
export type Dashboard = {
  active_month: string;
  period: Period;
  current_month: string;
  data_months: string[];
  profile: { display_name: string; school: string; city: string; province: string; currency: "CAD"; is_fictional: true };
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  savings_goals: SavingsGoal[];
  missions: Mission[];
  xp_total: number;
  category_spending: CategorySpending[];
  credit: { account_id: string; account_name: string; balance_cents: number; credit_limit_cents: number; utilization_basis_points: number } | null;
  financial_health: FinancialHealth;
  money_calendar: MoneyCalendar;
  recurring: RecurringSummary;
  learning: LearningProgress;
  investing_foundations: FoundationCheck[];
  spending_classification: { needs_cents: number; wants_cents: number; needs_basis_points: number; wants_basis_points: number };
  bills: Bill[];
  pay_schedule: PaySchedule | null;
  home: { available_cents: number; cash_cents: number; cash_history: MonthPoint[]; cash_change_basis_points: number | null; savings_cents: number; savings_history: MonthPoint[]; monthly_saved_cents: number; monthly_goal_cents: number; spending_change_basis_points: number | null; weekly_flexible_cents: number };
  net_worth: { cash_cents: number; savings_cents: number; investments_cents: number | null; liabilities_cents: number; net_worth_cents: number };
  previous_month_cash_flow_cents: number | null;
  spending_power_cents: number;
  totals: { available_balance_cents: number; income_cents: number; spending_cents: number; cash_flow_cents: number; total_budget_cents: number; budget_remaining_cents: number; savings_contributions_cents: number; savings_rate_basis_points: number };
};

export type HistoryMonth = { month: string; income_cents: number; spending_cents: number; cash_flow_cents: number; budget_cents: number; transaction_count: number };
export type History = {
  start: string;
  end: string;
  months: HistoryMonth[];
  totals: { income_cents: number; spending_cents: number; cash_flow_cents: number; months_with_activity: number; average_spending_cents: number };
  categories: CategorySpending[];
  data_months: string[];
};
export type Growth = { points: { year: number; contributed_cents: number; balance_cents: number }[]; contributed_cents: number; balance_cents: number; growth_cents: number; fees_cost_cents: number };
export type CategorySuggestion = { category_id: string | null; category_name: string | null; necessity: "need" | "want" | null; matched: string | null };
export type CreditUtilization = { balance_cents: number; credit_limit_cents: number; utilization_basis_points: number; within_common_guideline: boolean };

export type TransactionWrite = Omit<Transaction, "id" | "category" | "necessity" | "auto_categorized" | "bill_id" | "paid_automatically"> & { repeat?: { frequency: BillFrequency; next_due: string | null; auto_record: boolean } | null };
/** One purchase or deposit across several accounts; the API saves one transaction per account. */
export type SplitTransactionWrite = Omit<TransactionWrite, "account_id" | "amount_cents"> & { splits: { account_id: string; amount_cents: number }[] };
export type GoalWrite = Pick<SavingsGoal, "name" | "target_cents" | "current_cents" | "target_date" | "account_id">;
export type CoachRole = "user" | "assistant";
export type CoachFact = { label: string; display: string; cents: number | null; basis_points: number | null; source: string };
export type CoachProposal = { id: string; version: string; kind: "goal_contribution" | "budget_limit"; title: string; reason: string; target_id: string; target_name: string; current_cents: number; proposed_cents: number };
export type CoachReply = {
  reply: string;
  follow_ups: string[];
  facts: CoachFact[];
  tools_used: { name: string; label: string }[];
  proposal: CoachProposal | null;
  source: "ai" | "built_in";
  fallback_reason: "no_api_key" | "model_error" | "timeout" | "unverified_numbers" | null;
  model: string | null;
  usage: { input_tokens: number; output_tokens: number; elapsed_ms: number };
};
export type CoachSignal = { id: string; tone: "positive" | "watch" | "alert"; title: string; detail: string; prompt: string };
export type CoachBrief = { greeting: string; month_label: string; signals: CoachSignal[]; suggested_questions: string[] };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }

  get needsSignIn(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

type TokenSources = {
  sessionToken: () => Promise<string | null>;
  demoMode: boolean;
  demoToken: string | undefined;
};

/**
 * Picks the bearer token for API calls: the Supabase session first, then the fictional demo
 * token only when demo mode is explicitly enabled. Never invents a token.
 */
async function resolveAccessToken(sources: TokenSources): Promise<string> {
  const sessionToken = await sources.sessionToken();
  if (sessionToken) return sessionToken;
  if (sources.demoMode && sources.demoToken) return sources.demoToken;
  throw new ApiError("Sign in to view your Penny dashboard.", 401);
}

const browserTokenSources: TokenSources = {
  sessionToken: getSupabaseAccessToken,
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  demoToken: process.env.NEXT_PUBLIC_DEMO_AUTH_TOKEN,
};

async function authorizedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await resolveAccessToken(browserTokenSources);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? `Request failed with status ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

const request = (path: string, init?: RequestInit) => authorizedRequest<Dashboard>(path, init);

/** Appends the month whose snapshot the API should return (YYYY-MM-01). */
const inMonth = (path: string, month?: string) => (month ? `${path}${path.includes("?") ? "&" : "?"}month=${encodeURIComponent(month)}` : path);

export const dashboardApi = {
  load: (month?: string) => request(inMonth("/api/v1/dashboard", month)),
  loadPeriod: (start: string, end: string) => request(`/api/v1/dashboard?start=${start}&end=${end}`),
  createTransaction: (body: TransactionWrite, month?: string) => request(inMonth("/api/v1/transactions", month), { method: "POST", body: JSON.stringify(body) }),
  createSplitTransaction: (body: SplitTransactionWrite, month?: string) => request(inMonth("/api/v1/transactions/split", month), { method: "POST", body: JSON.stringify(body) }),
  updateTransaction: (id: string, body: Partial<TransactionWrite>, month?: string) => request(inMonth(`/api/v1/transactions/${id}`, month), { method: "PATCH", body: JSON.stringify(body) }),
  deleteTransaction: (id: string, month?: string) => request(inMonth(`/api/v1/transactions/${id}`, month), { method: "DELETE" }),
  createBudget: (body: { category_id: string; month_start: string; limit_cents: number }, month?: string) => request(inMonth("/api/v1/budgets", month), { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: string, limit_cents: number, month?: string) => request(inMonth(`/api/v1/budgets/${id}`, month), { method: "PATCH", body: JSON.stringify({ limit_cents }) }),
  deleteBudget: (id: string, month?: string) => request(inMonth(`/api/v1/budgets/${id}`, month), { method: "DELETE" }),
  copyBudgets: (fromMonth: string, toMonth: string) => request("/api/v1/budgets/copy", { method: "POST", body: JSON.stringify({ from_month: fromMonth, to_month: toMonth }) }),
  createGoal: (body: GoalWrite, month?: string) => request(inMonth("/api/v1/savings-goals", month), { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<GoalWrite> & { status?: SavingsGoal["status"] }, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}`, month), { method: "PATCH", body: JSON.stringify(body) }),
  deleteGoal: (id: string, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}`, month), { method: "DELETE" }),
  contributeToGoal: (id: string, amount_cents: number, fromAccountId: string, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}/contributions`, month), { method: "POST", body: JSON.stringify({ amount_cents, from_account_id: fromAccountId }) }),
  completeMission: (id: string, month?: string) => request(inMonth(`/api/v1/missions/${id}/complete`, month), { method: "POST" }),
  billHistory: (id: string) => authorizedRequest<BillHistory>(`/api/v1/bills/${id}/history`),
  markBillPaid: (id: string, month?: string) => request(inMonth(`/api/v1/bills/${id}/mark-paid`, month), { method: "POST" }),
  createBill: (body: Omit<Bill, "id" | "last_paid_on">, month?: string) => request(inMonth("/api/v1/bills", month), { method: "POST", body: JSON.stringify(body) }),
  updateBill: (id: string, body: Partial<Omit<Bill, "id" | "last_paid_on">>, month?: string) => request(inMonth(`/api/v1/bills/${id}`, month), { method: "PATCH", body: JSON.stringify(body) }),
  deleteBill: (id: string, month?: string) => request(inMonth(`/api/v1/bills/${id}`, month), { method: "DELETE" }),
  setPaySchedule: (body: PaySchedule) => request("/api/v1/pay-schedule", { method: "PUT", body: JSON.stringify(body) }),
  createCategory: (body: { name: string; kind: Category["kind"]; parent_id: string | null }) => request("/api/v1/categories", { method: "POST", body: JSON.stringify(body) }),
  deleteCategory: (id: string) => request(`/api/v1/categories/${id}`, { method: "DELETE" }),
  createAccount: (body: { name: string; account_type: AccountType; balance_cents: number; credit_limit_cents: number | null }) => request("/api/v1/accounts", { method: "POST", body: JSON.stringify(body) }),
  renameAccount: (id: string, name: string) => request(`/api/v1/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteAccount: (id: string) => request(`/api/v1/accounts/${id}`, { method: "DELETE" }),
  importCsv: (csv: string, account_id: string) => authorizedRequest<{ imported: number; skipped: number; errors: string[]; dashboard: Dashboard }>("/api/v1/transactions/import", { method: "POST", body: JSON.stringify({ csv, account_id }) }),
  completeLesson: (id: string) => request(`/api/v1/lessons/${id}/complete`, { method: "POST" }),
  suggestCategory: (description: string, kind: Transaction["kind"]) => authorizedRequest<CategorySuggestion>(`/api/v1/categorize?description=${encodeURIComponent(description)}&kind=${kind}`),
};

export const historyApi = {
  load: (start: string, end: string) => authorizedRequest<History>(`/api/v1/history?start=${start}&end=${end}`),
};

export const calculationsApi = {
  growth: (body: { initial_cents: number; monthly_cents: number; years: number; annual_return_basis_points: number; annual_fee_basis_points: number }) => authorizedRequest<Growth>("/api/v1/calculations/growth", { method: "POST", body: JSON.stringify(body) }),
  creditUtilization: (balance_cents: number, credit_limit_cents: number) => authorizedRequest<CreditUtilization>("/api/v1/calculations/credit-utilization", { method: "POST", body: JSON.stringify({ balance_cents, credit_limit_cents }) }),
};

export const coachApi = {
  brief: () => authorizedRequest<CoachBrief>("/api/v1/coach/brief"),
  chat: (messages: { role: CoachRole; content: string }[]) => authorizedRequest<CoachReply>("/api/v1/coach/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  approve: (proposal: CoachProposal) => authorizedRequest<{ message: string; dashboard: Dashboard }>(`/api/v1/coach/proposals/${proposal.id}/approve`, { method: "POST", body: JSON.stringify({ approved: true, version: proposal.version }) }),
};

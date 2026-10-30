import { getSupabaseAccessToken } from "./supabase";

export type Account = { id: string; name: string; account_type: "chequing" | "savings" | "credit"; balance_cents: number; credit_limit_cents: number | null };
export type Category = { id: string; name: string; colour_token: string };
export type Transaction = { id: string; description: string; category: string; account_id: string; category_id: string | null; amount_cents: number; kind: "income" | "spending"; occurred_on: string };
export type Budget = { id: string; category_id: string; category_name: string; month_start: string; limit_cents: number; spent_cents: number; remaining_cents: number; usage_basis_points: number };
export type SavingsGoal = { id: string; name: string; target_cents: number; current_cents: number; target_date: string | null; status: "active" | "completed" | "paused"; progress_basis_points: number };
export type Mission = { id: string; title: string; description: string; xp_reward: number; completed: boolean };
export type CategorySpending = { category_id: string | null; category_name: string; colour_token: string; spent_cents: number; share_basis_points: number };
export type DailySpending = { day: string; spent_cents: number; cumulative_cents: number };
export type FinancialHealthFactor = { id: string; label: string; score: number; max_score: number; explanation: string };
export type FinancialHealth = { score: number; weekly_change: number | null; factors: FinancialHealthFactor[]; methodology: string; limitations: string[] };
export type FinancialInsight = { id: string; headline: string; explanation: string; action_label: string | null; destination: "budget" | "transactions" | "goals" | "ai" | "credit"; source: string };
export type UpcomingBill = { id: string; name: string; amount_cents: number; due_on: string; status: "scheduled" | "paid"; payment_source: "user_marked" | "not_verified" };
export type Dashboard = {
  active_month: string;
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
  daily_spending: DailySpending[];
  credit: { account_id: string; account_name: string; balance_cents: number; credit_limit_cents: number; utilization_basis_points: number };
  investment_data: { available: false; title: string; explanation: string };
  credit_score_data: { available: false; title: string; explanation: string };
  financial_health: FinancialHealth;
  insights: FinancialInsight[];
  spending_classification: { needs_cents: number; wants_cents: number; needs_basis_points: number; wants_basis_points: number };
  upcoming_bills: UpcomingBill[];
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
export type CreditUtilization = { balance_cents: number; credit_limit_cents: number; utilization_basis_points: number; within_common_guideline: boolean };

export type TransactionWrite = Omit<Transaction, "id" | "category">;
export type GoalWrite = Pick<SavingsGoal, "name" | "target_cents" | "current_cents" | "target_date">;
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
  createTransaction: (body: TransactionWrite, month?: string) => request(inMonth("/api/v1/transactions", month), { method: "POST", body: JSON.stringify(body) }),
  updateTransaction: (id: string, body: Partial<TransactionWrite>, month?: string) => request(inMonth(`/api/v1/transactions/${id}`, month), { method: "PATCH", body: JSON.stringify(body) }),
  deleteTransaction: (id: string, month?: string) => request(inMonth(`/api/v1/transactions/${id}`, month), { method: "DELETE" }),
  createBudget: (body: { category_id: string; month_start: string; limit_cents: number }, month?: string) => request(inMonth("/api/v1/budgets", month), { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: string, limit_cents: number, month?: string) => request(inMonth(`/api/v1/budgets/${id}`, month), { method: "PATCH", body: JSON.stringify({ limit_cents }) }),
  deleteBudget: (id: string, month?: string) => request(inMonth(`/api/v1/budgets/${id}`, month), { method: "DELETE" }),
  copyBudgets: (fromMonth: string, toMonth: string) => request("/api/v1/budgets/copy", { method: "POST", body: JSON.stringify({ from_month: fromMonth, to_month: toMonth }) }),
  createGoal: (body: GoalWrite, month?: string) => request(inMonth("/api/v1/savings-goals", month), { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<GoalWrite> & { status?: SavingsGoal["status"] }, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}`, month), { method: "PATCH", body: JSON.stringify(body) }),
  deleteGoal: (id: string, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}`, month), { method: "DELETE" }),
  contributeToGoal: (id: string, amount_cents: number, month?: string) => request(inMonth(`/api/v1/savings-goals/${id}/contributions`, month), { method: "POST", body: JSON.stringify({ amount_cents }) }),
  completeMission: (id: string, month?: string) => request(inMonth(`/api/v1/missions/${id}/complete`, month), { method: "POST" }),
  markBillPaid: (id: string, month?: string) => request(inMonth(`/api/v1/upcoming-bills/${id}/mark-paid`, month), { method: "POST" }),
};

export const historyApi = {
  load: (start: string, end: string) => authorizedRequest<History>(`/api/v1/history?start=${start}&end=${end}`),
};

export const calculationsApi = {
  creditUtilization: (balance_cents: number, credit_limit_cents: number) => authorizedRequest<CreditUtilization>("/api/v1/calculations/credit-utilization", { method: "POST", body: JSON.stringify({ balance_cents, credit_limit_cents }) }),
};

export const coachApi = {
  brief: () => authorizedRequest<CoachBrief>("/api/v1/coach/brief"),
  chat: (messages: { role: CoachRole; content: string }[]) => authorizedRequest<CoachReply>("/api/v1/coach/chat", { method: "POST", body: JSON.stringify({ messages }) }),
  approve: (proposal: CoachProposal) => authorizedRequest<{ message: string; dashboard: Dashboard }>(`/api/v1/coach/proposals/${proposal.id}/approve`, { method: "POST", body: JSON.stringify({ approved: true, version: proposal.version }) }),
};

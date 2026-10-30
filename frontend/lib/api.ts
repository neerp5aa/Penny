import { getSupabaseAccessToken } from "./supabase";

export type Account = { id: string; name: string; account_type: "chequing" | "savings" | "credit"; balance_cents: number; credit_limit_cents: number | null };
export type Category = { id: string; name: string; colour_token: string };
export type Transaction = { id: string; description: string; category: string; account_id: string; category_id: string | null; amount_cents: number; kind: "income" | "spending"; occurred_on: string };
export type Budget = { id: string; category_id: string; category_name: string; month_start: string; limit_cents: number; spent_cents: number; remaining_cents: number; usage_basis_points: number };
export type SavingsGoal = { id: string; name: string; target_cents: number; current_cents: number; target_date: string | null; status: "active" | "completed" | "paused"; progress_basis_points: number };
export type Mission = { id: string; title: string; description: string; xp_reward: number; completed: boolean };
export type CategorySpending = { category_id: string | null; category_name: string; colour_token: string; spent_cents: number; share_basis_points: number };
export type DailySpending = { day: string; spent_cents: number; cumulative_cents: number };
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
  totals: { available_balance_cents: number; income_cents: number; spending_cents: number; cash_flow_cents: number; total_budget_cents: number; budget_remaining_cents: number; savings_contributions_cents: number };
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
export type CouncilClaim = { id: string; label: string; value_cents: number; source_tool: string };
export type CouncilViewpoint = { agent: "Savvy" | "Max" | "Joy"; role: string; stance: "cautious" | "conditional" | "supportive"; headline: string; reasoning: string; assumptions: string[]; tradeoffs: string[]; claim_ids: string[] };
export type CouncilScenario = { name: string; description: string; cash_flow_after_cents: number; budget_remaining_after_cents: number; months: number | null };
export type CouncilResponse = {
  status: "complete" | "needs_information";
  decision: "buy_now" | "save_then_buy" | "wait" | "needs_information";
  summary: string;
  selected_agents: ("Savvy" | "Max" | "Joy")[];
  missing_information: string[];
  assumptions: string[];
  viewpoints: CouncilViewpoint[];
  disagreements: string[];
  quantitative_claims: CouncilClaim[];
  scenarios: CouncilScenario[];
  recommended_actions: { title: string; rationale: string; priority: "now" | "next" | "optional" }[];
  verification: { verified: boolean; checks: string[]; issues: string[] };
  goal_change_proposal: { proposal_id: string; proposal_version: string; goal_id: string; goal_name: string; current_cents: number; contribution_cents: number; proposed_current_cents: number; requires_approval: true } | null;
  llm_status: "used" | "fallback_no_key" | "fallback_failure" | "not_needed";
  limits: { debate_rounds_used: number; debate_rounds_max: number; tool_calls_used: number; tool_calls_max: number; output_tokens_used: number; output_tokens_max: number; execution_ms: number; execution_ms_max: number };
};

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

export type TokenSources = {
  sessionToken: () => Promise<string | null>;
  demoMode: boolean;
  demoToken: string | undefined;
};

/**
 * Picks the bearer token for API calls: the Supabase session first, then the fictional demo
 * token only when demo mode is explicitly enabled. Never invents a token.
 */
export async function resolveAccessToken(sources: TokenSources): Promise<string> {
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
const councilRequest = authorizedRequest;

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
};

export const historyApi = {
  load: (start: string, end: string) => authorizedRequest<History>(`/api/v1/history?start=${start}&end=${end}`),
};

export const calculationsApi = {
  creditUtilization: (balance_cents: number, credit_limit_cents: number) => authorizedRequest<CreditUtilization>("/api/v1/calculations/credit-utilization", { method: "POST", body: JSON.stringify({ balance_cents, credit_limit_cents }) }),
};

export const councilApi = {
  analyze: (body: { question: string; purchase_name?: string; purchase_cents?: number; time_horizon_months?: number; savings_goal_id?: string }) => councilRequest<CouncilResponse>("/api/v1/council/analyze", { method: "POST", body: JSON.stringify(body) }),
  approveGoalChange: (proposalId: string, proposalVersion: string) => councilRequest<{ status: "applied"; message: string; dashboard: Dashboard }>(`/api/v1/council/proposals/${proposalId}/approve`, { method: "POST", body: JSON.stringify({ approved: true, proposal_version: proposalVersion }) }),
};

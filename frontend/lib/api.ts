export type Account = { id: string; name: string; account_type: "chequing" | "savings" | "credit"; balance_cents: number; credit_limit_cents: number | null };
export type Category = { id: string; name: string; colour_token: string };
export type Transaction = { id: string; description: string; category: string; account_id: string; category_id: string | null; amount_cents: number; kind: "income" | "spending"; occurred_on: string };
export type Budget = { id: string; category_id: string; category_name: string; month_start: string; limit_cents: number; spent_cents: number; remaining_cents: number; usage_basis_points: number };
export type SavingsGoal = { id: string; name: string; target_cents: number; current_cents: number; target_date: string | null; status: "active" | "completed" | "paused"; progress_basis_points: number };
export type Mission = { id: string; title: string; description: string; xp_reward: number; completed: boolean };
export type CategorySpending = { category_id: string | null; category_name: string; colour_token: string; spent_cents: number; share_basis_points: number };
export type Dashboard = {
  active_month: string;
  profile: { display_name: string; school: string; city: string; province: string; currency: "CAD"; is_fictional: true };
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  savings_goals: SavingsGoal[];
  missions: Mission[];
  category_spending: CategorySpending[];
  credit: { account_id: string; account_name: string; balance_cents: number; credit_limit_cents: number; utilization_basis_points: number };
  totals: { available_balance_cents: number; income_cents: number; spending_cents: number; cash_flow_cents: number; total_budget_cents: number; budget_remaining_cents: number; savings_contributions_cents: number };
};

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

async function request(path: string, init?: RequestInit): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<Dashboard>;
}

async function councilRequest<T>(path: string, init: RequestInit): Promise<T> {
  const token = process.env.NEXT_PUBLIC_DEMO_AUTH_TOKEN ?? "penny-local-demo-token";
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Council request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const dashboardApi = {
  load: () => request("/api/v1/dashboard"),
  createTransaction: (body: TransactionWrite) => request("/api/v1/transactions", { method: "POST", body: JSON.stringify(body) }),
  updateTransaction: (id: string, body: Partial<TransactionWrite>) => request(`/api/v1/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTransaction: (id: string) => request(`/api/v1/transactions/${id}`, { method: "DELETE" }),
  createBudget: (body: { category_id: string; month_start: string; limit_cents: number }) => request("/api/v1/budgets", { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: string, limit_cents: number) => request(`/api/v1/budgets/${id}`, { method: "PATCH", body: JSON.stringify({ limit_cents }) }),
  deleteBudget: (id: string) => request(`/api/v1/budgets/${id}`, { method: "DELETE" }),
  createGoal: (body: GoalWrite) => request("/api/v1/savings-goals", { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<GoalWrite> & { status?: SavingsGoal["status"] }) => request(`/api/v1/savings-goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteGoal: (id: string) => request(`/api/v1/savings-goals/${id}`, { method: "DELETE" }),
};

export const councilApi = {
  analyze: (body: { question: string; purchase_name?: string; purchase_cents?: number; time_horizon_months?: number; savings_goal_id?: string }) => councilRequest<CouncilResponse>("/api/v1/council/analyze", { method: "POST", body: JSON.stringify(body) }),
  approveGoalChange: (proposalId: string, proposalVersion: string) => councilRequest<{ status: "applied"; message: string; dashboard: Dashboard }>(`/api/v1/council/proposals/${proposalId}/approve`, { method: "POST", body: JSON.stringify({ approved: true, proposal_version: proposalVersion }) }),
};

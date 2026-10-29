from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dashboard_models import DashboardResponse


class CouncilModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CouncilRequest(CouncilModel):
    question: str = Field(min_length=1, max_length=500)
    purchase_name: str | None = Field(default=None, max_length=80)
    purchase_cents: int | None = Field(default=None, gt=0)
    time_horizon_months: int | None = Field(default=None, ge=1, le=24)
    savings_goal_id: str | None = None


class BudgetSummaryResult(CouncilModel):
    available_balance_cents: int
    income_cents: int
    spending_cents: int
    cash_flow_cents: int
    total_budget_cents: int
    budget_remaining_cents: int
    active_savings_cents: int


class AffordabilityResult(CouncilModel):
    purchase_cents: int
    available_after_purchase_cents: int
    monthly_cash_flow_after_purchase_cents: int
    can_pay_from_available_cash: bool
    covered_by_monthly_cash_flow: bool


class BudgetChangeResult(CouncilModel):
    spending_after_cents: int
    budget_remaining_after_cents: int
    cash_flow_after_cents: int


class SavingsPlanResult(CouncilModel):
    goal_id: str | None
    purchase_cents: int
    saved_for_purchase_cents: int
    remaining_to_save_cents: int
    horizon_months: int
    monthly_contribution_cents: int
    cash_flow_after_contribution_cents: int
    feasible_from_current_cash_flow: bool


class VerificationResult(CouncilModel):
    verified: bool
    checks: list[str]
    issues: list[str]


class QuantitativeClaim(CouncilModel):
    id: str
    label: str
    value_cents: int
    source_tool: str


class AgentViewpoint(CouncilModel):
    agent: Literal["Savvy", "Max", "Joy"]
    role: str
    stance: Literal["cautious", "conditional", "supportive"]
    headline: str
    reasoning: str
    assumptions: list[str]
    tradeoffs: list[str]
    claim_ids: list[str]


class Scenario(CouncilModel):
    name: str
    description: str
    cash_flow_after_cents: int
    budget_remaining_after_cents: int
    months: int | None = None


class RecommendedAction(CouncilModel):
    title: str
    rationale: str
    priority: Literal["now", "next", "optional"]


class GoalChangeProposal(CouncilModel):
    proposal_id: str
    proposal_version: str
    goal_id: str
    goal_name: str
    current_cents: int
    contribution_cents: int
    proposed_current_cents: int
    requires_approval: Literal[True]


class CouncilLimits(CouncilModel):
    debate_rounds_used: int
    debate_rounds_max: int
    tool_calls_used: int
    tool_calls_max: int
    output_tokens_used: int
    output_tokens_max: int
    execution_ms: int
    execution_ms_max: int


class CouncilResponse(CouncilModel):
    status: Literal["complete", "needs_information"]
    decision: Literal["buy_now", "save_then_buy", "wait", "needs_information"]
    summary: str
    selected_agents: list[Literal["Savvy", "Max", "Joy"]]
    missing_information: list[str]
    assumptions: list[str]
    viewpoints: list[AgentViewpoint]
    disagreements: list[str]
    quantitative_claims: list[QuantitativeClaim]
    scenarios: list[Scenario]
    recommended_actions: list[RecommendedAction]
    verification: VerificationResult
    goal_change_proposal: GoalChangeProposal | None
    llm_status: Literal["used", "fallback_no_key", "fallback_failure", "not_needed"]
    limits: CouncilLimits


class ApprovalRequest(CouncilModel):
    approved: Literal[True]
    proposal_version: str


class ApprovalResponse(CouncilModel):
    status: Literal["applied"]
    message: str
    dashboard: DashboardResponse

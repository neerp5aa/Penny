from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import Account, DemoUser, Summary, Transaction


class DashboardModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Category(DashboardModel):
    id: str
    name: str
    colour_token: str


class MonthlyBudget(DashboardModel):
    id: str
    category_id: str
    category_name: str
    month_start: date
    limit_cents: int = Field(ge=0)
    spent_cents: int = Field(ge=0)
    remaining_cents: int
    usage_basis_points: int = Field(ge=0)


class Goal(DashboardModel):
    id: str
    name: str
    target_cents: int = Field(gt=0)
    current_cents: int = Field(ge=0)
    target_date: date | None
    status: Literal["active", "completed", "paused"]
    progress_basis_points: int = Field(ge=0, le=10_000)


class Mission(DashboardModel):
    id: str
    title: str
    description: str
    xp_reward: int = Field(ge=0)
    completed: bool


class CategorySpending(DashboardModel):
    category_id: str | None
    category_name: str
    colour_token: str
    spent_cents: int = Field(ge=0)
    share_basis_points: int = Field(ge=0, le=10_000)


class CreditSnapshot(DashboardModel):
    account_id: str
    account_name: str
    balance_cents: int = Field(ge=0)
    credit_limit_cents: int = Field(gt=0)
    utilization_basis_points: int = Field(ge=0)


class AvailabilitySnapshot(DashboardModel):
    available: Literal[False]
    title: str
    explanation: str


class FinancialHealthFactor(DashboardModel):
    id: str
    label: str
    score: int = Field(ge=0)
    max_score: int = Field(gt=0)
    explanation: str


class FinancialHealth(DashboardModel):
    score: int = Field(ge=0, le=100)
    weekly_change: int | None
    factors: list[FinancialHealthFactor]
    methodology: str
    limitations: list[str]


class FinancialInsight(DashboardModel):
    id: str
    headline: str
    explanation: str
    action_label: str | None = None
    destination: Literal["budget", "transactions", "goals", "ai", "credit"]
    source: str


class SpendingClassification(DashboardModel):
    needs_cents: int = Field(ge=0)
    wants_cents: int = Field(ge=0)
    needs_basis_points: int = Field(ge=0, le=10_000)
    wants_basis_points: int = Field(ge=0, le=10_000)


class UpcomingBill(DashboardModel):
    id: str
    name: str
    amount_cents: int = Field(gt=0)
    due_on: date
    status: Literal["scheduled", "paid"]
    payment_source: Literal["user_marked", "not_verified"]


class NetWorthSnapshot(DashboardModel):
    cash_cents: int = Field(ge=0)
    savings_cents: int = Field(ge=0)
    investments_cents: int | None
    liabilities_cents: int = Field(ge=0)
    net_worth_cents: int


class DashboardTotals(Summary):
    available_balance_cents: int
    total_budget_cents: int = Field(ge=0)
    savings_rate_basis_points: int


class DailySpending(DashboardModel):
    day: date
    spent_cents: int = Field(ge=0)
    cumulative_cents: int = Field(ge=0)


class DashboardResponse(DashboardModel):
    active_month: date
    current_month: date
    data_months: list[date]
    profile: DemoUser
    accounts: list[Account]
    categories: list[Category]
    transactions: list[Transaction]
    budgets: list[MonthlyBudget]
    savings_goals: list[Goal]
    missions: list[Mission]
    xp_total: int = Field(ge=0)
    category_spending: list[CategorySpending]
    daily_spending: list[DailySpending]
    credit: CreditSnapshot
    investment_data: AvailabilitySnapshot
    credit_score_data: AvailabilitySnapshot
    financial_health: FinancialHealth
    insights: list[FinancialInsight]
    spending_classification: SpendingClassification
    upcoming_bills: list[UpcomingBill]
    net_worth: NetWorthSnapshot
    previous_month_cash_flow_cents: int | None
    spending_power_cents: int = Field(ge=0)
    totals: DashboardTotals


class TransactionWrite(DashboardModel):
    description: str = Field(min_length=1, max_length=160)
    account_id: str
    category_id: str | None = None
    amount_cents: int = Field(gt=0)
    kind: Literal["income", "spending"]
    occurred_on: date


class TransactionPatch(DashboardModel):
    description: str | None = Field(default=None, min_length=1, max_length=160)
    account_id: str | None = None
    category_id: str | None = None
    amount_cents: int | None = Field(default=None, gt=0)
    kind: Literal["income", "spending"] | None = None
    occurred_on: date | None = None


class BudgetWrite(DashboardModel):
    category_id: str
    month_start: date
    limit_cents: int = Field(ge=0)


class BudgetPatch(DashboardModel):
    limit_cents: int = Field(ge=0)


class GoalWrite(DashboardModel):
    name: str = Field(min_length=1, max_length=100)
    target_cents: int = Field(gt=0)
    current_cents: int = Field(ge=0)
    target_date: date | None = None


class GoalPatch(DashboardModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    target_cents: int | None = Field(default=None, gt=0)
    current_cents: int | None = Field(default=None, ge=0)
    target_date: date | None = None
    status: Literal["active", "completed", "paused"] | None = None


class BudgetCopyRequest(DashboardModel):
    from_month: date
    to_month: date


class GoalContributionRequest(DashboardModel):
    amount_cents: int = Field(gt=0)


class HistoryMonth(DashboardModel):
    month: date
    income_cents: int = Field(ge=0)
    spending_cents: int = Field(ge=0)
    cash_flow_cents: int
    budget_cents: int = Field(ge=0)
    transaction_count: int = Field(ge=0)


class HistoryTotals(DashboardModel):
    income_cents: int = Field(ge=0)
    spending_cents: int = Field(ge=0)
    cash_flow_cents: int
    months_with_activity: int = Field(ge=0)
    average_spending_cents: int = Field(ge=0)


class HistoryResponse(DashboardModel):
    start: date
    end: date
    months: list[HistoryMonth]
    totals: HistoryTotals
    categories: list[CategorySpending]
    data_months: list[date]


class CreditUtilizationRequest(DashboardModel):
    balance_cents: int = Field(ge=0)
    credit_limit_cents: int = Field(gt=0)


class CreditUtilizationResponse(DashboardModel):
    balance_cents: int
    credit_limit_cents: int
    utilization_basis_points: int = Field(ge=0)
    within_common_guideline: bool

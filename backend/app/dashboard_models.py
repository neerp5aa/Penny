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


class DashboardTotals(Summary):
    available_balance_cents: int
    total_budget_cents: int = Field(ge=0)


class DashboardResponse(DashboardModel):
    active_month: date
    profile: DemoUser
    accounts: list[Account]
    categories: list[Category]
    transactions: list[Transaction]
    budgets: list[MonthlyBudget]
    savings_goals: list[Goal]
    missions: list[Mission]
    category_spending: list[CategorySpending]
    credit: CreditSnapshot
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

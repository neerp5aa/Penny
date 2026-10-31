from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(StrictModel):
    status: Literal["ok"]
    service: Literal["penny-api"]
    version: str


class CurrentUserResponse(StrictModel):
    user_id: str
    email: str | None
    auth_method: Literal["supabase", "demo"]
    has_demo_financial_data: bool


class DemoUser(StrictModel):
    id: str
    display_name: str
    age: int = Field(ge=18)
    school: str
    city: str
    province: str
    currency: Literal["CAD"]
    is_fictional: Literal[True]


class Account(StrictModel):
    id: str
    name: str
    account_type: Literal["chequing", "savings", "credit", "cash", "investment", "other"]
    balance_cents: int = Field(ge=0)
    credit_limit_cents: int | None = Field(default=None, ge=0)


class Transaction(StrictModel):
    id: str
    description: str
    category: str
    account_id: str = "acct-chequing"
    category_id: str | None = None
    amount_cents: int = Field(ge=0)
    kind: Literal["income", "spending"]
    occurred_on: date
    # Filled in when a dashboard snapshot is built; never trusted from clients.
    necessity: Literal["need", "want"] | None = None
    auto_categorized: bool = False
    # Set when this is a payment of a recurring bill. How it was paid: True when Penny recorded
    # it on the due date, False when the user marked it paid, None for history or a manual entry.
    bill_id: str | None = None
    paid_automatically: bool | None = None


class Budget(StrictModel):
    category: str
    limit_cents: int = Field(ge=0)
    spent_cents: int = Field(ge=0)
    remaining_cents: int


class SavingsGoal(StrictModel):
    name: str
    target_cents: int = Field(gt=0)
    current_cents: int = Field(ge=0)
    contribution_this_month_cents: int = Field(ge=0)
    target_date: date


class Summary(StrictModel):
    income_cents: int
    spending_cents: int
    cash_flow_cents: int
    budget_remaining_cents: int
    savings_contributions_cents: int


class DemoDashboardResponse(StrictModel):
    profile: DemoUser
    accounts: list[Account]
    transactions: list[Transaction]
    budgets: list[Budget]
    savings_goal: SavingsGoal
    summary: Summary

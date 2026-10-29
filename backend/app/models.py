from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(StrictModel):
    status: Literal["ok"]
    service: Literal["penny-api"]
    version: str


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
    account_type: Literal["chequing", "savings", "credit"]
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


class TransactionAmountInput(StrictModel):
    amount_cents: int = Field(ge=0)
    kind: Literal["income", "spending"]


class SummaryRequest(StrictModel):
    transactions: list[TransactionAmountInput]
    budget_cents: int = Field(ge=0)
    savings_contributions_cents: list[Annotated[int, Field(ge=0)]]


class DemoDashboardResponse(StrictModel):
    profile: DemoUser
    accounts: list[Account]
    transactions: list[Transaction]
    budgets: list[Budget]
    savings_goal: SavingsGoal
    summary: Summary

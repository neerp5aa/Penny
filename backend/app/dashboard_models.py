from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Account, DemoUser, Summary, Transaction


class DashboardModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


BillFrequency = Literal["weekly", "biweekly", "monthly", "yearly"]
PayFrequency = Literal["weekly", "biweekly", "semimonthly", "monthly", "custom"]
AccountType = Literal["chequing", "savings", "credit", "cash", "investment", "other"]


class Category(DashboardModel):
    id: str
    name: str
    colour_token: str
    kind: Literal["income", "spending"] = "spending"
    # Subcategories (Food -> Groceries) roll their spending up into the parent's budget.
    parent_id: str | None = None
    custom: bool = False


class MonthlyBudget(DashboardModel):
    id: str
    category_id: str
    category_name: str
    month_start: date
    limit_cents: int = Field(ge=0)
    spent_cents: int = Field(ge=0)
    remaining_cents: int
    usage_basis_points: int = Field(ge=0)
    # True when shown from last month because this month has no budgets yet.
    carried_over: bool = False


class GoalContribution(DashboardModel):
    """Money moved into a goal: out of one account and into the goal's account."""

    id: str
    amount_cents: int = Field(gt=0)
    from_account_id: str
    to_account_id: str | None
    occurred_on: date
    source: Literal["you", "penny"]


class Goal(DashboardModel):
    id: str
    name: str
    target_cents: int = Field(gt=0)
    current_cents: int = Field(ge=0)
    target_date: date | None
    status: Literal["active", "completed", "paused"]
    progress_basis_points: int = Field(ge=0, le=10_000)
    # Even monthly saving needed to reach the target by its date; None without a date.
    monthly_needed_cents: int | None = None
    # Where the saved money is held; contributions move money into this account.
    account_id: str | None = None
    contributed_this_month_cents: int = Field(default=0, ge=0)
    recent_contributions: list[GoalContribution] = []


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


class FinancialHealthFactor(DashboardModel):
    id: str
    label: str
    score: int = Field(ge=0)
    max_score: int = Field(gt=0)
    explanation: str


class MonthPoint(DashboardModel):
    month: date
    value: int


class FinancialHealth(DashboardModel):
    score: int = Field(ge=0, le=100)
    # Scores for the months before this one, oldest first (empty until computed).
    history: list[MonthPoint] = []
    factors: list[FinancialHealthFactor]
    methodology: str
    limitations: list[str]


class SpendingClassification(DashboardModel):
    needs_cents: int = Field(ge=0)
    wants_cents: int = Field(ge=0)
    needs_basis_points: int = Field(ge=0, le=10_000)
    wants_basis_points: int = Field(ge=0, le=10_000)


class Bill(DashboardModel):
    """A scheduled bill or subscription, entered once and repeated on its frequency."""

    id: str
    name: str
    amount_cents: int = Field(gt=0)
    category_id: str | None
    account_id: str
    frequency: BillFrequency
    next_due: date
    # Auto-recorded bills are marked paid on their due date; others wait for the user.
    auto_record: bool
    last_paid_on: date | None = None


class PaySchedule(DashboardModel):
    name: str = Field(min_length=1, max_length=80)
    amount_cents: int = Field(gt=0)
    account_id: str
    frequency: PayFrequency
    next_payday: date
    # Only for "custom": days between paydays.
    interval_days: int | None = Field(default=None, ge=7, le=62)


class NetWorthSnapshot(DashboardModel):
    cash_cents: int = Field(ge=0)
    savings_cents: int = Field(ge=0)
    investments_cents: int | None
    liabilities_cents: int = Field(ge=0)
    net_worth_cents: int


class AccountGoal(DashboardModel):
    id: str
    name: str
    current_cents: int = Field(ge=0)


class AccountBalance(DashboardModel):
    id: str
    name: str
    account_type: Literal["chequing", "savings", "credit", "cash", "investment", "other"]
    balance_cents: int = Field(ge=0)
    # What the account adds to net worth: negative for a card balance owed.
    net_cents: int
    credit_limit_cents: int | None
    available_credit_cents: int | None
    utilization_basis_points: int | None
    goals: list[AccountGoal]
    # Goal money kept here (capped at the balance), and what's left over.
    goal_cents: int = Field(ge=0)
    free_cents: int | None
    money_in_cents: int = Field(ge=0)
    money_out_cents: int = Field(ge=0)
    last_activity_on: date | None


class AccountsOverview(DashboardModel):
    """Every account and how they add up. Balances are as of today, whatever period is shown."""

    accounts: list[AccountBalance]
    spending_cents: int = Field(ge=0)  # chequing and cash
    savings_cents: int = Field(ge=0)
    investments_cents: int = Field(ge=0)
    other_cents: int = Field(ge=0)
    assets_cents: int = Field(ge=0)
    owed_cents: int = Field(ge=0)
    net_worth_cents: int
    goal_cents: int = Field(ge=0)
    # Goal money recorded against an account beyond what it actually holds (0 when consistent).
    goal_shortfall_cents: int = Field(ge=0)


class RecurringExpense(DashboardModel):
    id: str
    name: str
    category_name: str | None
    amount_cents: int = Field(gt=0)
    monthly_cents: int = Field(ge=0)
    frequency: BillFrequency
    next_due: date
    days_until_due: int
    kind: Literal["bill", "subscription"]
    auto_record: bool
    last_paid_on: date | None
    payment_count: int = Field(ge=0)


class RecurringSuggestion(DashboardModel):
    """A charge that repeats in history but is not set up as a bill yet."""

    name: str
    category_id: str | None
    amount_cents: int = Field(gt=0)
    next_due: date


class RecurringSummary(DashboardModel):
    items: list[RecurringExpense]
    suggestions: list[RecurringSuggestion]
    fixed_monthly_cents: int = Field(ge=0)
    subscriptions_monthly_cents: int = Field(ge=0)
    due_next_7_days_cents: int = Field(ge=0)
    due_before_payday_cents: int = Field(ge=0)
    share_of_income_basis_points: int | None
    methodology: str


class MoneyDay(DashboardModel):
    day: date
    future: bool
    score: int | None = Field(default=None, ge=0, le=100)
    zone: Literal["green", "yellow", "red"] | None = None
    pace_points: int | None = None
    day_points: int | None = None
    flexible_spent_cents: int = Field(ge=0)
    total_spent_cents: int = Field(ge=0)
    income_cents: int = Field(ge=0)
    transaction_count: int = Field(ge=0)
    due: list[str]


class MoneyStreaks(DashboardModel):
    current_green: int = Field(ge=0)
    best_green: int = Field(ge=0)
    no_spend_days: int = Field(ge=0)
    green_days: int = Field(ge=0)
    scored_days: int = Field(ge=0)


class MoneyCalendar(DashboardModel):
    month: date
    today: date | None
    today_score: int | None
    today_zone: Literal["green", "yellow", "red"] | None
    flexible_budget_cents: int = Field(ge=0)
    daily_allowance_cents: int = Field(ge=0)
    days: list[MoneyDay]
    streaks: MoneyStreaks
    methodology: str


class Lesson(DashboardModel):
    id: str
    track: Literal["budgeting", "saving", "tax", "credit", "rules", "investing"]
    difficulty: Literal["easy", "medium", "hard"]
    title: str
    xp_reward: int = Field(gt=0)
    completed: bool


class LearningProgress(DashboardModel):
    xp_total: int = Field(ge=0)
    level: int = Field(ge=1)
    level_xp: int = Field(ge=0)
    level_size_xp: int = Field(gt=0)
    streak_days: int = Field(ge=0)
    completed_today: bool
    # Monday to Sunday of the current week: whether a lesson was completed that day.
    week_activity: list[bool]
    next_lesson: Lesson | None
    lessons: list[Lesson]


class FoundationCheck(DashboardModel):
    id: str
    title: str
    status: Literal["met", "in_progress", "not_met"]
    detail: str


class HomeSummary(DashboardModel):
    """Headline numbers for the home screen; every value is computed from transactions."""

    available_cents: int
    cash_cents: int
    # Month-end cash (chequing, cash, savings) for the last six months, oldest first.
    cash_history: list[MonthPoint]
    cash_change_basis_points: int | None
    savings_cents: int
    savings_history: list[MonthPoint]
    monthly_saved_cents: int
    monthly_goal_cents: int
    # Month-to-date spending vs the previous month over the same days.
    spending_change_basis_points: int | None
    weekly_flexible_cents: int


class Period(DashboardModel):
    """The date range a dashboard snapshot covers."""

    start: date
    end: date
    label: str
    phrase: str
    single_month: bool
    month_count: int = Field(ge=1)


class DashboardTotals(Summary):
    available_balance_cents: int
    total_budget_cents: int = Field(ge=0)
    savings_rate_basis_points: int


class DashboardResponse(DashboardModel):
    active_month: date
    period: Period
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
    credit: CreditSnapshot | None
    financial_health: FinancialHealth
    money_calendar: MoneyCalendar
    recurring: RecurringSummary
    learning: LearningProgress
    investing_foundations: list[FoundationCheck]
    spending_classification: SpendingClassification
    bills: list[Bill]
    pay_schedule: PaySchedule | None
    home: HomeSummary
    net_worth: NetWorthSnapshot
    accounts_overview: AccountsOverview
    previous_month_cash_flow_cents: int | None
    spending_power_cents: int = Field(ge=0)
    totals: DashboardTotals


class TransactionRepeat(DashboardModel):
    """Turns a new expense into a recurring bill as well."""

    frequency: BillFrequency
    # Next time it's due; defaults to one period after the transaction's date.
    next_due: date | None = None
    auto_record: bool = True


class TransactionWrite(DashboardModel):
    description: str = Field(min_length=1, max_length=160)
    account_id: str
    category_id: str | None = None
    amount_cents: int = Field(gt=0)
    kind: Literal["income", "spending"]
    occurred_on: date
    repeat: TransactionRepeat | None = None


class TransactionSplit(DashboardModel):
    account_id: str
    amount_cents: int = Field(gt=0)


class SplitTransactionWrite(DashboardModel):
    """One purchase or deposit split across several accounts; saved as one transaction each."""

    description: str = Field(min_length=1, max_length=160)
    category_id: str | None = None
    kind: Literal["income", "spending"]
    occurred_on: date
    splits: list[TransactionSplit] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def _one_split_per_account(self) -> "SplitTransactionWrite":
        accounts = [split.account_id for split in self.splits]
        if len(set(accounts)) != len(accounts):
            raise ValueError("Each account can appear only once in a split")
        return self


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
    account_id: str | None = None


class GoalPatch(DashboardModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    target_cents: int | None = Field(default=None, gt=0)
    current_cents: int | None = Field(default=None, ge=0)
    target_date: date | None = None
    status: Literal["active", "completed", "paused"] | None = None
    account_id: str | None = None


class BudgetCopyRequest(DashboardModel):
    from_month: date
    to_month: date


class GoalContributionRequest(DashboardModel):
    amount_cents: int = Field(gt=0)
    # Where the money comes from; defaults to the main chequing account.
    from_account_id: str | None = None


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


class GrowthRequest(DashboardModel):
    initial_cents: int = Field(ge=0, le=100_000_000)
    monthly_cents: int = Field(ge=0, le=10_000_000)
    years: int = Field(ge=1, le=50)
    annual_return_basis_points: int = Field(ge=0, le=2_000)
    annual_fee_basis_points: int = Field(default=0, ge=0, le=500)


class GrowthPoint(DashboardModel):
    year: int
    contributed_cents: int
    balance_cents: int


class GrowthResponse(DashboardModel):
    points: list[GrowthPoint]
    contributed_cents: int
    balance_cents: int
    growth_cents: int
    fees_cost_cents: int


class CategorySuggestion(DashboardModel):
    category_id: str | None
    category_name: str | None
    necessity: Literal["need", "want"] | None
    matched: str | None
    # "rules" for a keyword match, "ai" when the model picked it, None when nothing fit.
    source: Literal["rules", "ai"] | None = None


class BillWrite(DashboardModel):
    name: str = Field(min_length=1, max_length=80)
    amount_cents: int = Field(gt=0)
    category_id: str | None = None
    account_id: str
    frequency: BillFrequency = "monthly"
    next_due: date
    auto_record: bool = True


class BillPatch(DashboardModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    amount_cents: int | None = Field(default=None, gt=0)
    category_id: str | None = None
    account_id: str | None = None
    frequency: BillFrequency | None = None
    next_due: date | None = None
    auto_record: bool | None = None


class CategoryWrite(DashboardModel):
    name: str = Field(min_length=1, max_length=40)
    kind: Literal["income", "spending"]
    parent_id: str | None = None


class AccountWrite(DashboardModel):
    name: str = Field(min_length=1, max_length=60)
    account_type: AccountType
    balance_cents: int = Field(default=0, ge=0)
    credit_limit_cents: int | None = Field(default=None, gt=0)


class AccountPatch(DashboardModel):
    name: str = Field(min_length=1, max_length=60)


class ForecastEvent(DashboardModel):
    name: str
    # Signed: income positive, spending negative.
    amount_cents: int
    kind: Literal["income", "bill", "spending", "daily_budget", "planned"]
    projected: bool


class ForecastDay(DashboardModel):
    day: date
    start_cents: int
    end_cents: int
    status: Literal["comfortable", "tight", "short"]
    past: bool
    is_today: bool
    is_payday: bool
    events: list[ForecastEvent]


class PayCycle(DashboardModel):
    offset: int
    label: str
    start: date
    end: date


class CycleReview(DashboardModel):
    income_cents: int = Field(ge=0)
    spent_cents: int = Field(ge=0)
    biggest_expense_name: str | None
    biggest_expense_cents: int | None
    previous_spent_cents: int | None


class ForecastResponse(DashboardModel):
    cycles: list[PayCycle]
    cycle: PayCycle
    mode: Literal["bills", "budget"]
    days: list[ForecastDay]
    starting_cents: int
    ending_cents: int
    lowest_day: date
    lowest_cents: int
    next_payday: date
    days_until_payday: int
    daily_budget_cents: int
    tight_threshold_cents: int
    review: CycleReview | None
    methodology: str


class ImportRequest(DashboardModel):
    csv: str = Field(min_length=1, max_length=400_000)
    account_id: str


class ImportResult(DashboardModel):
    imported: int
    skipped: int
    errors: list[str]
    dashboard: DashboardResponse


class BillHistory(DashboardModel):
    bill: Bill
    payments: list[Transaction]
    payment_count: int = Field(ge=0)
    total_paid_cents: int = Field(ge=0)
    paid_this_year_cents: int = Field(ge=0)
    average_cents: int = Field(ge=0)
    auto_paid_count: int = Field(ge=0)

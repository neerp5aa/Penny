import calendar
from collections.abc import Iterable
from dataclasses import asdict
from datetime import date, timedelta
from threading import RLock
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.dashboard_features import (
    LESSON_XP,
    bill_due_dates,
    build_calendar,
    build_foundations,
    build_learning,
    build_recurring,
    flexible_budget_cents,
    next_due_after,
    score_month,
)
from app.dashboard_models import (
    AccountWrite,
    Bill,
    BillHistory,
    BillPatch,
    BillWrite,
    BudgetPatch,
    BudgetWrite,
    Category,
    CategorySpending,
    CategoryWrite,
    CreditSnapshot,
    CycleReview,
    DashboardResponse,
    DashboardTotals,
    FinancialHealth,
    FinancialHealthFactor,
    ForecastDay,
    ForecastEvent,
    ForecastResponse,
    Goal,
    GoalContribution,
    GoalPatch,
    GoalWrite,
    HistoryMonth,
    HistoryResponse,
    HistoryTotals,
    HomeSummary,
    Mission,
    MoneyCalendar,
    MonthlyBudget,
    MonthPoint,
    NetWorthSnapshot,
    PayCycle,
    PaySchedule,
    Period,
    RecurringExpense,
    RecurringSummary,
    SpendingClassification,
    SplitTransactionWrite,
    TransactionPatch,
    TransactionRepeat,
    TransactionWrite,
)
from app.domain.categorize import categorize, necessity
from app.domain.csv_import import parse_transactions_csv
from app.domain.finance import (
    TransactionAmount,
    TransactionKind,
    add_months,
    average_cents,
    build_summary,
    ceil_div,
    format_cad,
    months_until,
    share_basis_points,
)
from app.domain.money_days import DayScore
from app.domain.pay_cycle import (
    TIGHT_THRESHOLD_CENTS,
    Cycle,
    DayBalance,
    cycles_around,
    forecast,
    paydays,
)
from app.domain.pay_cycle import Event as CycleEvent
from app.domain.periods import describe_period, month_end, months_between
from app.domain.recurring import detect_fixed_series, series_key
from app.fixtures import build_demo_dashboard
from app.history_fixtures import build_history_budgets, build_history_transactions
from app.models import Account, Transaction

MAX_HISTORY_MONTHS = 24
UNUSUAL_MULTIPLE = 3
UNUSUAL_MINIMUM_CENTS = 4_000
# Account types whose balance is money you can spend day to day.
SPENDABLE_TYPES = ("chequing", "cash")


def _pay_cycle(cycle: Cycle) -> PayCycle:
    label = (
        "Current" if cycle.offset == 0 else f"{'P' if cycle.offset < 0 else 'F'}{abs(cycle.offset)}"
    )
    return PayCycle(offset=cycle.offset, label=label, start=cycle.start, end=cycle.end)


def _forecast_day(day: DayBalance) -> ForecastDay:
    return ForecastDay(
        day=day.day,
        start_cents=day.start_cents,
        end_cents=day.end_cents,
        status=day.status,
        past=day.past,
        is_today=day.is_today,
        is_payday=day.is_payday,
        events=[
            ForecastEvent(
                name=e.name, amount_cents=e.amount_cents, kind=e.kind, projected=e.projected
            )  # type: ignore[arg-type]
            for e in day.events
        ],
    )


def month_start(value: date) -> date:
    return value.replace(day=1)


def _next_month(value: date) -> date:
    return date(value.year + value.month // 12, value.month % 12 + 1, 1)


def _previous_month(value: date) -> date:
    return date(
        value.year - (1 if value.month == 1 else 0), 12 if value.month == 1 else value.month - 1, 1
    )


def _same_month(value: date, month: date) -> bool:
    return value.year == month.year and value.month == month.month


# fmt: off
def _starter_categories() -> list[Category]:
    def spending(id: str, name: str, colour: str, parent: str | None = None) -> Category:
        return Category(id=id, name=name, colour_token=colour, kind="spending", parent_id=parent)

    def income(id: str, name: str) -> Category:
        return Category(id=id, name=name, colour_token="emerald", kind="income")

    return [
        income("cat-income", "Paycheque"),
        income("cat-scholarship", "Scholarship & bursary"),
        income("cat-allowance", "Allowance"),
        income("cat-gift", "Gift"),
        income("cat-benefits", "Benefits & pension"),
        income("cat-refund", "Refund"),
        spending("cat-housing", "Housing", "rose"),
        spending("cat-food", "Food", "amber"),
        spending("cat-groceries", "Groceries", "amber", "cat-food"),
        spending("cat-eating-out", "Eating out", "amber", "cat-food"),
        spending("cat-transport", "Transportation", "sky"),
        spending("cat-phone", "Phone", "violet"),
        spending("cat-school", "School", "indigo"),
        spending("cat-fun", "Fun", "pink"),
        spending("cat-health", "Health", "emerald"),
    ]
# fmt: on


class DashboardStore:
    """Thread-safe fictional store for the hackathon MVP."""

    # The demo's "today". Past months come from the fictional history fixture.
    active_month = date(2026, 10, 1)

    def __init__(self, owner_user_ids: Iterable[str] = ()) -> None:
        fixture = build_demo_dashboard()
        self._profile = fixture.profile
        # The fictional data set is owned by the demo identity plus any explicitly configured
        # Supabase user ids. Every public operation checks the caller against this set.
        self._owner_user_ids = frozenset({self._profile.id, *owner_user_ids})
        self._accounts = {item.id: item for item in fixture.accounts}
        self._categories = {item.id: item for item in _starter_categories()}
        category_ids = {category.name: category.id for category in self._categories.values()}
        category_ids["Income"] = "cat-income"
        self._transactions = {
            item.id: item.model_copy(
                update={
                    "account_id": "acct-chequing",
                    "category_id": category_ids.get(item.category),
                }
            )
            for item in fixture.transactions
        }
        self._transactions.update({item.id: item for item in build_history_transactions()})
        # Fixtures only know top-level names; refine them into income types and subcategories.
        for item_id, item in self._transactions.items():
            if item.kind == "income" or item.category_id == "cat-food":
                refined = categorize(item.description, item.kind).category_id
                if refined:
                    self._transactions[item_id] = item.model_copy(
                        update={"category_id": refined, "category": self._categories[refined].name}
                    )
        self._budgets = {
            f"budget-{index}": {
                "id": f"budget-{index}",
                "category_id": category_ids[item.category],
                "month_start": self.active_month,
                "limit_cents": item.limit_cents,
            }
            for index, item in enumerate(fixture.budgets, start=1)
        }
        self._budgets.update({str(item["id"]): item for item in build_history_budgets()})
        self._goals = {
            "goal-emergency": {
                "id": "goal-emergency",
                "name": fixture.savings_goal.name,
                "target_cents": fixture.savings_goal.target_cents,
                "current_cents": fixture.savings_goal.current_cents,
                "target_date": fixture.savings_goal.target_date,
                "status": "active",
                "account_id": "acct-savings",
            },
            "goal-laptop": {
                "id": "goal-laptop",
                "name": "Laptop fund",
                "target_cents": 120_000,
                "current_cents": 30_000,
                "target_date": date(2027, 1, 31),
                "status": "active",
                "account_id": "acct-savings",
            },
        }
        self._missions = [
            Mission(
                id="mission-review",
                title="Review three recent purchases",
                description="Check their categories and make sure each one supports your plan.",
                xp_reward=40,
                completed=False,
            ),
            Mission(
                id="mission-save",
                title="Protect your next $15",
                description="Move a fictional $15 toward your emergency fund this week.",
                xp_reward=60,
                completed=True,
            ),
            Mission(
                id="mission-budget",
                title="Give every spending category a limit",
                description="Check that each category you spend in has a monthly budget.",
                xp_reward=50,
                completed=False,
            ),
            Mission(
                id="mission-credit",
                title="Learn your credit utilization",
                description="Open Credit basics and see how your fictional card balance compares.",
                xp_reward=30,
                completed=False,
            ),
            Mission(
                id="mission-council",
                title="Ask before a big purchase",
                description="Ask Penny AI about something you are thinking of buying.",
                xp_reward=50,
                completed=False,
            ),
        ]
        self._bills = {
            bill.id: bill
            for bill in [
                Bill(
                    id="bill-rent",
                    name="Student housing",
                    amount_cents=82_500,
                    category_id="cat-housing",
                    account_id="acct-chequing",
                    frequency="monthly",
                    next_due=date(2026, 11, 1),
                    auto_record=True,
                ),
                Bill(
                    id="bill-transit",
                    name="Halifax Transit pass",
                    amount_cents=7_800,
                    category_id="cat-transport",
                    account_id="acct-chequing",
                    frequency="monthly",
                    next_due=date(2026, 11, 3),
                    auto_record=True,
                ),
                Bill(
                    id="bill-phone",
                    name="Mobile plan",
                    amount_cents=4_500,
                    category_id="cat-phone",
                    account_id="acct-chequing",
                    frequency="monthly",
                    next_due=date(2026, 11, 14),
                    auto_record=True,
                ),
                Bill(
                    id="bill-streaming",
                    name="Streaming subscription",
                    amount_cents=1_299,
                    category_id="cat-fun",
                    account_id="acct-chequing",
                    frequency="monthly",
                    next_due=date(2026, 11, 18),
                    auto_record=False,
                ),
            ]
        }
        # Link past payments to the seeded bills, so each bill has a payment history.
        for item_id, item in self._transactions.items():
            match = next(
                (
                    bill
                    for bill in self._bills.values()
                    if item.kind == "spending"
                    and (
                        series_key(item.description) == series_key(bill.name)
                        or (
                            item.category_id == bill.category_id
                            and item.amount_cents == bill.amount_cents
                        )
                    )
                ),
                None,
            )
            if match:
                self._transactions[item_id] = item.model_copy(update={"bill_id": match.id})
        self._pay_schedule: PaySchedule | None = PaySchedule(
            name="Harbour Books pay",
            amount_cents=126_400,
            account_id="acct-chequing",
            frequency="monthly",
            next_payday=date(2026, 11, 25),
        )
        self._contributions: list[GoalContribution] = []
        # Fictional learning history so the demo opens with a streak in progress.
        self._lessons_completed: dict[str, date] = {
            "budget-basics": self.today() - timedelta(days=2),
            "needs-vs-wants": self.today() - timedelta(days=1),
        }
        self._lock = RLock()

    def _financial_health(
        self,
        month: date,
        spending_cents: int,
        budget_cents: int,
        cash_flow_cents: int,
    ) -> FinancialHealth:
        previous = self._monthly_transactions(_previous_month(month))
        previous_income = sum(item.amount_cents for item in previous if item.kind == "income")
        previous_spending = sum(item.amount_cents for item in previous if item.kind == "spending")
        previous_cash_flow = previous_income - previous_spending

        factors: list[FinancialHealthFactor] = []
        limitations = [
            "No verified bill-payment history is available, so it is not scored.",
            "Weekly score history is not stored yet, so no weekly change is shown.",
            "This is an educational indicator for fictional demo data, not a credit score.",
        ]
        if budget_cents:
            over = max(0, spending_cents - budget_cents)
            budget_score = max(0, 35 - min(35, over * 35 // budget_cents))
            budget_explanation = (
                "Full points because spending is within the monthly plan."
                if over == 0
                else "Reduced only for the share spent above the monthly plan."
            )
            factors.append(
                FinancialHealthFactor(
                    id="budget",
                    label="Budget adherence",
                    score=budget_score,
                    max_score=35,
                    explanation=budget_explanation,
                )
            )
        else:
            limitations.append("No monthly budget is available, so budget adherence is excluded.")

        savings_score = (
            30
            if cash_flow_cents > 0 and previous_cash_flow > 0
            else 20
            if cash_flow_cents > 0
            else 0
        )
        if self._monthly_transactions(month):
            factors.append(
                FinancialHealthFactor(
                    id="savings",
                    label="Savings consistency",
                    score=savings_score,
                    max_score=30,
                    explanation=(
                        "Uses positive monthly cash flow in this month and the previous month; "
                        "income level itself is not scored."
                    ),
                )
            )
        else:
            limitations.append(
                "No activity is available for this month, so savings consistency is excluded."
            )
        active_goals = [item for item in self._goals.values() if item["status"] == "active"]
        average_goal_progress = (
            sum(
                min(10_000, item["current_cents"] * 10_000 // item["target_cents"])
                for item in active_goals
            )
            // len(active_goals)
            if active_goals
            else 0
        )
        goal_score = average_goal_progress * 20 // 10_000
        if active_goals:
            factors.append(
                FinancialHealthFactor(
                    id="goals",
                    label="Goal progress",
                    score=goal_score,
                    max_score=20,
                    explanation="Uses the average progress of active fictional savings goals.",
                )
            )
        else:
            limitations.append(
                "No active savings goals are available, so goal progress is excluded."
            )
        if previous_spending:
            change = abs(spending_cents - previous_spending) * 10_000 // previous_spending
            stability_score = 15 if change <= 1_000 else 10 if change <= 2_500 else 5
            factors.append(
                FinancialHealthFactor(
                    id="stability",
                    label="Spending stability",
                    score=stability_score,
                    max_score=15,
                    explanation="Based on how sharply total spending changed from the prior month.",
                )
            )
        else:
            limitations.append(
                "Not enough prior spending data is available, so stability is excluded."
            )
        available_points = sum(item.max_score for item in factors)
        return FinancialHealth(
            score=sum(item.score for item in factors) * 100 // available_points
            if available_points
            else 0,
            factors=factors,
            methodology=(
                "A behaviour-based score from budget adherence, positive cash flow, goal progress, "
                "and month-to-month spending stability. Lower income is never penalized."
            ),
            limitations=limitations,
        )

    def today(self) -> date:
        """The demo's "today": the real date, kept inside the demo's current month."""
        last = calendar.monthrange(self.active_month.year, self.active_month.month)[1]
        return min(max(date.today(), self.active_month), self.active_month.replace(day=last))

    def _goal(self, item: dict) -> Goal:
        target = item["target_date"]
        mine = [c for c in self._contributions if c.id.startswith(f"{item['id']}:")]
        this_month = sum(
            c.amount_cents for c in mine if _same_month(c.occurred_on, self.active_month)
        )
        # The monthly need is fixed from where the goal stood when the month began, so adding
        # money this month counts toward it instead of shrinking it.
        remaining = max(0, item["target_cents"] - (item["current_cents"] - this_month))
        return Goal(
            **item,
            contributed_this_month_cents=this_month,
            recent_contributions=sorted(mine, key=lambda c: c.occurred_on, reverse=True)[:5],
            progress_basis_points=min(
                10_000, item["current_cents"] * 10_000 // item["target_cents"]
            ),
            monthly_needed_cents=(
                ceil_div(remaining, months_until(self.active_month, target))
                if target and item["status"] == "active"
                else None
            ),
        )

    def _flag_unusual(self, rows: list[Transaction]) -> list[Transaction]:
        """Marks everyday purchases at least 3x their category's average over the last 6 months.

        Bills and small amounts are never flagged, and a category needs a few purchases first.
        """
        since = add_months(self.active_month, -6)
        amounts: dict[str | None, dict[str, int]] = {}
        for t in self._transactions.values():
            if t.kind == "spending" and not t.bill_id and t.occurred_on >= since:
                amounts.setdefault(t.category_id, {})[t.id] = t.amount_cents
        flagged = []
        for t in rows:
            # Compare against the category's other purchases, so a big one can't hide itself.
            usual = [a for i, a in amounts.get(t.category_id, {}).items() if i != t.id]
            unusual = (
                t.kind == "spending"
                and not t.bill_id
                and t.amount_cents >= UNUSUAL_MINIMUM_CENTS
                and len(usual) >= 3
                and t.amount_cents * len(usual) >= UNUSUAL_MULTIPLE * sum(usual)
            )
            flagged.append(t.model_copy(update={"unusual": True}) if unusual else t)
        return flagged

    @staticmethod
    def _with_necessity(item: Transaction) -> Transaction:
        if item.kind != "spending":
            return item
        return item.model_copy(update={"necessity": necessity(item.description, item.category_id)})

    def _typical(self, month: date, field: str) -> int:
        """Average monthly income or cash flow over the three months before `month`."""
        totals = []
        for offset in range(1, 4):
            rows = self._monthly_transactions(add_months(month, -offset))
            if not rows:
                continue
            income = sum(t.amount_cents for t in rows if t.kind == "income")
            spending = sum(t.amount_cents for t in rows if t.kind == "spending")
            totals.append(income if field == "income" else income - spending)
        return sum(totals) // len(totals) if totals else 0

    def _health_score(self, month: date) -> int:
        rows = self._monthly_transactions(month)
        income = sum(t.amount_cents for t in rows if t.kind == "income")
        spending = sum(t.amount_cents for t in rows if t.kind == "spending")
        budget = sum(item["limit_cents"] for item in self._monthly_budgets(month))
        return self._financial_health(month, spending, budget, income - spending).score

    def _cash_cents(self) -> int:
        return sum(item.balance_cents for item in self._accounts_of(*SPENDABLE_TYPES, "savings"))

    def _cash_at_end_of(self, day: date) -> int:
        """Cash (chequing, cash, savings) at the end of `day`, reconstructed from transactions."""
        accounts = {item.id for item in self._accounts_of(*SPENDABLE_TYPES, "savings")}
        later = sum(
            t.amount_cents if t.kind == "income" else -t.amount_cents
            for t in self._transactions.values()
            if t.account_id in accounts and day < t.occurred_on <= self.today()
        )
        return self._cash_cents() - later

    def _home(self, cash_flow_cents: int, goals: list[Goal], allowance_cents: int) -> HomeSummary:
        today = self.today()
        months = [add_months(self.active_month, offset) for offset in range(-5, 1)]

        def month_end(month: date) -> date:
            last = month.replace(day=calendar.monthrange(month.year, month.month)[1])
            return min(last, today)

        def net(month: date) -> int:
            rows = self._monthly_transactions(month)
            return sum(t.amount_cents if t.kind == "income" else -t.amount_cents for t in rows)

        def spent_through(month: date, day: int) -> int:
            last = min(day, calendar.monthrange(month.year, month.month)[1])
            return sum(
                t.amount_cents
                for t in self._monthly_transactions(month)
                if t.kind == "spending" and t.occurred_on.day <= last
            )

        cash_history = [
            MonthPoint(month=m, value=self._cash_at_end_of(month_end(m))) for m in months
        ]
        previous_cash = cash_history[-2].value
        this_spend = spent_through(self.active_month, today.day)
        last_spend = spent_through(add_months(self.active_month, -1), today.day)
        return HomeSummary(
            available_cents=self._spendable_cents(),
            cash_cents=self._cash_cents(),
            cash_history=cash_history,
            cash_change_basis_points=(
                (self._cash_cents() - previous_cash) * 10_000 // previous_cash
                if previous_cash > 0
                else None
            ),
            savings_cents=sum(item.balance_cents for item in self._accounts_of("savings")),
            savings_history=[MonthPoint(month=m, value=net(m)) for m in months],
            monthly_saved_cents=cash_flow_cents,
            monthly_goal_cents=sum(goal.monthly_needed_cents or 0 for goal in goals),
            spending_change_basis_points=(
                (this_spend - last_spend) * 10_000 // last_spend if last_spend > 0 else None
            ),
            weekly_flexible_cents=allowance_cents * 7,
        )

    def _accounts_of(self, *types: str) -> list[Account]:
        return [item for item in self._accounts.values() if item.account_type in types]

    def _spendable_cents(self) -> int:
        """Money available for day-to-day spending: chequing and cash accounts."""
        return sum(item.balance_cents for item in self._accounts_of(*SPENDABLE_TYPES))

    def _next_payday(self) -> date | None:
        schedule = self._pay_schedule
        if not schedule:
            return None
        today = self.today()
        upcoming = paydays(
            schedule.frequency,
            schedule.next_payday,
            today + timedelta(days=1),
            today + timedelta(days=400),
            schedule.interval_days,
        )
        return upcoming[0] if upcoming else None

    def _recurring(self) -> RecurringSummary:
        return build_recurring(
            bills=list(self._bills.values()),
            transactions=list(self._transactions.values()),
            category_names={c.id: c.name for c in self._categories.values()},
            active_month=self.active_month,
            today=self.today(),
            next_payday=self._next_payday(),
            typical_income_cents=self._typical(self.active_month, "income"),
        )

    def _top_level(self, category_id: str | None) -> str | None:
        category = self._categories.get(category_id) if category_id else None
        return category.parent_id or category.id if category else None

    def _scored_month(self, month: date) -> list[DayScore]:
        """Daily Money Scores for a month, through today when it is the current month."""
        transactions = self._monthly_transactions(month)
        fixed = detect_fixed_series(self._transactions.values(), month)
        budget = flexible_budget_cents(
            sum(item["limit_cents"] for item in self._monthly_budgets(month)), fixed
        )
        days = calendar.monthrange(month.year, month.month)[1]
        through = self.today().day if month == self.active_month else days
        return score_month(month, transactions, fixed, budget, through)

    def _money_calendar(
        self, month: date, recurring_items: list[RecurringExpense]
    ) -> MoneyCalendar:
        scores = self._scored_month(month)
        history = [
            day for offset in (2, 1) for day in self._scored_month(add_months(month, -offset))
        ] + scores
        fixed = detect_fixed_series(self._transactions.values(), month)
        due: dict[date, list[str]] = {}
        if month == self.active_month:
            for item in recurring_items:
                if item.next_due.month == month.month:
                    due.setdefault(item.next_due, []).append(item.name)
        return build_calendar(
            month=month,
            today=self.today() if month == self.active_month else None,
            month_transactions=self._monthly_transactions(month),
            scores=scores,
            history=history,
            flexible_budget=flexible_budget_cents(
                sum(item["limit_cents"] for item in self._monthly_budgets(month)), fixed
            ),
            due_by_day=due,
        )

    def complete_lesson(self, user_id: str, lesson_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if lesson_id not in LESSON_XP:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
            # Idempotent: completing twice never awards XP twice.
            self._lessons_completed.setdefault(lesson_id, self.today())
            return self._snapshot()

    def _monthly_transactions(self, month: date) -> list[Transaction]:
        return [
            item for item in self._transactions.values() if _same_month(item.occurred_on, month)
        ]

    def _monthly_budgets(self, month: date) -> list[dict]:
        return [item for item in self._budgets.values() if item["month_start"] == month]

    def _data_months(self) -> list[date]:
        months = {month_start(item.occurred_on) for item in self._transactions.values()}
        months.update(item["month_start"] for item in self._budgets.values())
        months.add(self.active_month)
        return sorted(month for month in months if month <= self.active_month)

    def _category_breakdown(
        self, transactions: Iterable[Transaction]
    ) -> tuple[dict[str | None, int], list[CategorySpending]]:
        """Spending per top-level category (subcategories roll up into their parent)."""
        spending_by_category: dict[str | None, int] = {}
        for item in transactions:
            if item.kind == "spending":
                key = self._top_level(item.category_id)
                spending_by_category[key] = spending_by_category.get(key, 0) + item.amount_cents
        total = sum(spending_by_category.values())
        breakdown = []
        for category_id, spent in sorted(
            spending_by_category.items(), key=lambda pair: pair[1], reverse=True
        ):
            category = self._categories.get(category_id) if category_id else None
            breakdown.append(
                CategorySpending(
                    category_id=category_id,
                    category_name=category.name if category else "Uncategorized",
                    colour_token=category.colour_token if category else "slate",
                    spent_cents=spent,
                    share_basis_points=share_basis_points(spent, total),
                )
            )
        return spending_by_category, breakdown

    @staticmethod
    def _credit_snapshot(account: Account | None) -> CreditSnapshot | None:
        if not account or not account.credit_limit_cents:
            return None
        return CreditSnapshot(
            account_id=account.id,
            account_name=account.name,
            balance_cents=account.balance_cents,
            credit_limit_cents=account.credit_limit_cents,
            utilization_basis_points=account.balance_cents * 10_000 // account.credit_limit_cents,
        )

    def _snapshot(self, month: date | None = None) -> DashboardResponse:
        with self._lock:
            month = month_start(month or self.active_month)
            monthly = sorted(
                self._monthly_transactions(month), key=lambda item: item.occurred_on, reverse=True
            )
            domain_transactions = [
                TransactionAmount(item.amount_cents, TransactionKind(item.kind)) for item in monthly
            ]
            monthly_budgets = self._monthly_budgets(month)
            total_budget = sum(item["limit_cents"] for item in monthly_budgets)
            summary = build_summary(domain_transactions, total_budget, [])
            spending_by_category, breakdown = self._category_breakdown(monthly)
            exact: dict[str | None, int] = {}
            for item in monthly:
                if item.kind == "spending":
                    exact[item.category_id] = exact.get(item.category_id, 0) + item.amount_cents
            carried = not monthly_budgets and month == self.active_month
            if carried:
                previous = max(
                    (b["month_start"] for b in self._budgets.values() if b["month_start"] < month),
                    default=None,
                )
                monthly_budgets = [
                    {**item, "id": f"carry-{item['id']}", "month_start": month}
                    for item in (self._monthly_budgets(previous) if previous else [])
                ]
                total_budget = sum(item["limit_cents"] for item in monthly_budgets)
                summary = build_summary(domain_transactions, total_budget, [])
            budgets = []
            for item in monthly_budgets:
                category = self._categories[item["category_id"]]
                # A parent budget covers its subcategories; a subcategory budget only itself.
                spent = (
                    exact.get(category.id, 0)
                    if category.parent_id
                    else spending_by_category.get(category.id, 0)
                )
                budgets.append(
                    MonthlyBudget(
                        **item,
                        category_name=category.name,
                        spent_cents=spent,
                        remaining_cents=item["limit_cents"] - spent,
                        usage_basis_points=(spent * 10_000 // item["limit_cents"])
                        if item["limit_cents"]
                        else 0,
                        carried_over=carried,
                    )
                )
            goals = [self._goal(item) for item in self._goals.values()]
            monthly = self._flag_unusual([self._with_necessity(item) for item in monthly])
            credit_account = next(iter(self._accounts_of("credit")), None)
            liabilities = sum(item.balance_cents for item in self._accounts_of("credit"))
            asset_balance = sum(
                item.balance_cents
                for item in self._accounts.values()
                if item.account_type != "credit"
            )
            cash_balance = self._spendable_cents()
            savings_balance = sum(item.balance_cents for item in self._accounts_of("savings"))
            needs = sum(t.amount_cents for t in monthly if t.necessity == "need")
            wants = sum(t.amount_cents for t in monthly if t.necessity == "want")
            spending_total = needs + wants
            previous_transactions = self._monthly_transactions(_previous_month(month))
            previous_cash_flow = (
                sum(item.amount_cents for item in previous_transactions if item.kind == "income")
                - sum(
                    item.amount_cents for item in previous_transactions if item.kind == "spending"
                )
                if previous_transactions
                else None
            )
            recurring = self._recurring()
            calendar_view = self._money_calendar(month, recurring.items)
            mission_xp = sum(item.xp_reward for item in self._missions if item.completed)
            learning = build_learning(self._lessons_completed, mission_xp, self.today())
            return DashboardResponse(
                active_month=month,
                period=self._period(month, month_end(month)),
                current_month=self.active_month,
                data_months=self._data_months(),
                profile=self._profile,
                accounts=list(self._accounts.values()),
                categories=list(self._categories.values()),
                transactions=monthly,
                budgets=sorted(budgets, key=lambda item: item.category_name),
                savings_goals=goals,
                missions=self._missions,
                xp_total=learning.xp_total,
                category_spending=breakdown,
                credit=self._credit_snapshot(credit_account),
                financial_health=self._financial_health(
                    month, summary.spending_cents, total_budget, summary.cash_flow_cents
                ).model_copy(
                    update={
                        "history": [
                            MonthPoint(month=m, value=self._health_score(m))
                            for m in (add_months(month, offset) for offset in range(-5, 0))
                            if self._monthly_transactions(m)
                        ]
                    }
                ),
                money_calendar=calendar_view,
                recurring=recurring,
                learning=learning,
                investing_foundations=build_foundations(
                    savings_cents=savings_balance,
                    fixed_monthly_cents=recurring.fixed_monthly_cents,
                    card_balance_cents=liabilities,
                    typical_surplus_cents=self._typical(month, "cash_flow"),
                    goals_due_within_year=sum(
                        1
                        for goal in goals
                        if goal.status == "active"
                        and goal.target_date
                        and goal.target_date < add_months(self.active_month, 12)
                    ),
                ),
                spending_classification=SpendingClassification(
                    needs_cents=needs,
                    wants_cents=wants,
                    needs_basis_points=share_basis_points(needs, spending_total),
                    wants_basis_points=share_basis_points(wants, spending_total),
                ),
                bills=sorted(self._bills.values(), key=lambda item: item.next_due),
                pay_schedule=self._pay_schedule,
                home=self._home(
                    summary.cash_flow_cents, goals, calendar_view.daily_allowance_cents
                ),
                net_worth=NetWorthSnapshot(
                    cash_cents=cash_balance,
                    savings_cents=savings_balance,
                    investments_cents=None,
                    liabilities_cents=liabilities,
                    net_worth_cents=asset_balance - liabilities,
                ),
                previous_month_cash_flow_cents=previous_cash_flow,
                spending_power_cents=max(
                    0,
                    min(
                        summary.budget_remaining_cents,
                        cash_balance - recurring.due_before_payday_cents,
                    ),
                ),
                totals=DashboardTotals(
                    **asdict(summary),
                    available_balance_cents=asset_balance,
                    total_budget_cents=total_budget,
                    savings_rate_basis_points=(
                        summary.cash_flow_cents * 10_000 // summary.income_cents
                    )
                    if summary.income_cents
                    else 0,
                ),
            )

    def history_for_user(self, user_id: str, start: date, end: date) -> HistoryResponse:
        self.require_owner(user_id)
        start, end = month_start(start), month_start(end)
        if start > end:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "start must not be after end"
            )
        months: list[date] = [start]
        while months[-1] < end:
            months.append(_next_month(months[-1]))
            if len(months) > MAX_HISTORY_MONTHS:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"History is limited to {MAX_HISTORY_MONTHS} months per request",
                )
        with self._lock:
            rows = []
            in_range: list[Transaction] = []
            for month in months:
                monthly = self._monthly_transactions(month)
                in_range.extend(monthly)
                summary = build_summary(
                    [
                        TransactionAmount(item.amount_cents, TransactionKind(item.kind))
                        for item in monthly
                    ],
                    0,
                    [],
                )
                rows.append(
                    HistoryMonth(
                        month=month,
                        income_cents=summary.income_cents,
                        spending_cents=summary.spending_cents,
                        cash_flow_cents=summary.cash_flow_cents,
                        budget_cents=sum(
                            item["limit_cents"] for item in self._monthly_budgets(month)
                        ),
                        transaction_count=len(monthly),
                    )
                )
            _, categories = self._category_breakdown(in_range)
            income = sum(row.income_cents for row in rows)
            spending = sum(row.spending_cents for row in rows)
            active = sum(1 for row in rows if row.transaction_count)
            return HistoryResponse(
                start=start,
                end=end,
                months=rows,
                totals=HistoryTotals(
                    income_cents=income,
                    spending_cents=spending,
                    cash_flow_cents=income - spending,
                    months_with_activity=active,
                    average_spending_cents=average_cents(spending, active),
                ),
                categories=categories,
                data_months=self._data_months(),
            )

    def copy_budgets(self, user_id: str, from_month: date, to_month: date) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            from_month, to_month = month_start(from_month), month_start(to_month)
            if from_month == to_month:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a different month"
                )
            existing = {item["category_id"] for item in self._monthly_budgets(to_month)}
            source = [
                item
                for item in self._monthly_budgets(from_month)
                if item["category_id"] not in existing
            ]
            if not source:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "There are no new budgets to copy from that month"
                )
            for item in source:
                budget_id = f"budget-{uuid4().hex[:12]}"
                self._budgets[budget_id] = {
                    "id": budget_id,
                    "category_id": item["category_id"],
                    "month_start": to_month,
                    "limit_cents": item["limit_cents"],
                }
            return self._snapshot(to_month)

    def _default_source(self) -> str:
        account = next(iter(self._accounts_of("chequing")), None) or next(
            iter(self._accounts_of(*SPENDABLE_TYPES)), None
        )
        if not account:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Add a chequing account first"
            )
        return account.id

    def _move_into_goal(
        self, goal: dict, amount_cents: int, from_account_id: str, source: str
    ) -> None:
        """Moves real money for a goal contribution: out of one account, into the goal's account.

        Total cash is unchanged, but the money is no longer available to spend.
        """
        source_account = self._accounts.get(from_account_id)
        if not source_account or source_account.account_type == "credit":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a chequing, savings, or cash account"
            )
        if source_account.balance_cents < amount_cents:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"{source_account.name} only has {format_cad(source_account.balance_cents)}",
            )
        target_id = goal.get("account_id")
        if target_id != from_account_id:
            self._accounts[from_account_id] = source_account.model_copy(
                update={"balance_cents": source_account.balance_cents - amount_cents}
            )
            target = self._accounts.get(target_id) if target_id else None
            if target:
                self._accounts[target.id] = target.model_copy(
                    update={"balance_cents": target.balance_cents + amount_cents}
                )
        goal["current_cents"] += amount_cents
        if goal["current_cents"] >= goal["target_cents"]:
            goal["status"] = "completed"
        self._contributions.append(
            GoalContribution(
                id=f"{goal['id']}:{uuid4().hex[:8]}",
                amount_cents=amount_cents,
                from_account_id=from_account_id,
                to_account_id=target_id,
                occurred_on=self.today(),
                source=source,  # type: ignore[arg-type]
            )
        )

    def contribute_to_goal(
        self, user_id: str, goal_id: str, amount_cents: int, from_account_id: str | None = None
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal = self._goals.get(goal_id)
            if not goal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            remaining = goal["target_cents"] - goal["current_cents"]
            if remaining <= 0:
                raise HTTPException(status.HTTP_409_CONFLICT, "This goal has already been reached")
            if amount_cents > remaining:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "That is more than the amount left to reach this goal",
                )
            self._move_into_goal(
                goal, amount_cents, from_account_id or self._default_source(), "you"
            )
            return self._snapshot()

    def complete_mission(self, user_id: str, mission_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            index = next(
                (i for i, item in enumerate(self._missions) if item.id == mission_id), None
            )
            if index is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
            # Idempotent: completing twice never awards XP twice.
            self._missions[index] = self._missions[index].model_copy(update={"completed": True})
            return self._snapshot()

    # ------------------------------------------------------------------ bills

    def _record_bill(self, bill: Bill, on: date, automatically: bool) -> None:
        """Record one payment of a bill as a transaction and move it to its next due date."""
        transaction = Transaction(
            id=f"tx-{uuid4().hex[:12]}",
            description=bill.name,
            category=self._category_name(bill.category_id),
            account_id=bill.account_id,
            category_id=bill.category_id,
            amount_cents=bill.amount_cents,
            kind="spending",
            occurred_on=on,
            bill_id=bill.id,
            paid_automatically=automatically,
        )
        self._apply_account_effect(transaction, 1)
        self._transactions[transaction.id] = transaction
        self._bills[bill.id] = bill.model_copy(
            update={"last_paid_on": on, "next_due": next_due_after(bill.next_due, bill.frequency)}
        )

    def _auto_record_due_bills(self) -> None:
        """Auto-record bills are paid on their due date without the user having to tap."""
        today = self.today()
        for bill_id in list(self._bills):
            while (bill := self._bills[bill_id]).auto_record and bill.next_due <= today:
                try:
                    self._record_bill(bill, bill.next_due, automatically=True)
                except HTTPException:
                    break  # Not enough money in the account: leave it for the user.

    def mark_bill_paid(self, user_id: str, bill_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            bill = self._bills.get(bill_id)
            if not bill:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
            self._record_bill(bill, min(self.today(), bill.next_due), automatically=False)
            return self._snapshot()

    def bill_history(self, user_id: str, bill_id: str) -> BillHistory:
        with self._lock:
            self.require_owner(user_id)
            bill = self._bills.get(bill_id)
            if not bill:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
            payments = sorted(
                (t for t in self._transactions.values() if t.bill_id == bill_id),
                key=lambda item: item.occurred_on,
                reverse=True,
            )
            total = sum(t.amount_cents for t in payments)
            year = self.today().year
            return BillHistory(
                bill=bill,
                payments=payments,
                payment_count=len(payments),
                total_paid_cents=total,
                paid_this_year_cents=sum(
                    t.amount_cents for t in payments if t.occurred_on.year == year
                ),
                average_cents=average_cents(total, len(payments)),
                auto_paid_count=sum(1 for t in payments if t.paid_automatically is True),
            )

    def _validate_bill(self, account_id: str, category_id: str | None) -> None:
        if account_id not in self._accounts:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
        if category_id and self._category(category_id).kind != "spending":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Bills need a spending category"
            )

    def create_bill(self, user_id: str, request: BillWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            self._validate_bill(request.account_id, request.category_id)
            category_id = request.category_id or categorize(request.name, "spending").category_id
            bill = Bill(
                id=f"bill-{uuid4().hex[:10]}",
                **{**request.model_dump(), "category_id": category_id},
            )
            self._bills[bill.id] = bill
            return self._snapshot()

    def update_bill(self, user_id: str, bill_id: str, request: BillPatch) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            bill = self._bills.get(bill_id)
            if not bill:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
            updated = bill.model_copy(update=request.model_dump(exclude_unset=True))
            self._validate_bill(updated.account_id, updated.category_id)
            self._bills[bill_id] = updated
            return self._snapshot()

    def delete_bill(self, user_id: str, bill_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if self._bills.pop(bill_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Bill not found")
            return self._snapshot()

    # ------------------------------------------------------------------ pay schedule

    def set_pay_schedule(self, user_id: str, request: PaySchedule) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if request.account_id not in self._accounts:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
            if (request.frequency == "custom") != (request.interval_days is not None):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "Set interval_days only for a custom pay schedule",
                )
            self._pay_schedule = request
            return self._snapshot()

    def forecast(
        self,
        user_id: str,
        offset: int,
        mode: Literal["bills", "budget"],
        plan: tuple[str, int, date] | None = None,
    ) -> ForecastResponse:
        """`plan` is an unsaved what-if purchase (name, cents, day) added to the projection."""
        with self._lock:
            self.require_owner(user_id)
            schedule = self._pay_schedule
            if not schedule:
                raise HTTPException(status.HTTP_409_CONFLICT, "Set up your pay schedule first")
            today = self.today()
            cycles = cycles_around(
                schedule.frequency, schedule.next_payday, today, 1, 2, schedule.interval_days
            )
            cycle = next((item for item in cycles if item.offset == offset), None)
            if not cycle:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown pay cycle")
            spendable = {item.id for item in self._accounts_of(*SPENDABLE_TYPES)}
            actual = [
                CycleEvent(
                    t.occurred_on,
                    t.description,
                    t.amount_cents if t.kind == "income" else -t.amount_cents,
                    "income" if t.kind == "income" else "spending",
                    False,
                )
                for t in self._transactions.values()
                if t.account_id in spendable and t.occurred_on <= today
            ]
            horizon = cycles[-1].end
            recorded_today = any(e.day == today and e.kind == "income" for e in actual)
            projected = [
                CycleEvent(day, schedule.name, schedule.amount_cents, "income", True)
                for day in paydays(
                    schedule.frequency,
                    schedule.next_payday,
                    today,
                    horizon,
                    schedule.interval_days,
                )
                if day > today or not recorded_today
            ]
            for bill in self._bills.values():
                if bill.account_id in spendable:
                    projected += [
                        CycleEvent(day, bill.name, -bill.amount_cents, "bill", True)
                        for day in bill_due_dates(bill, today, horizon)
                    ]
            if plan:
                name, cents, day = plan
                if day < today:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_CONTENT, "Plan a purchase for today or later"
                    )
                projected.append(CycleEvent(day, f"Planned: {name}", -cents, "planned", True))
            daily = self._snapshot().money_calendar.daily_allowance_cents if mode == "budget" else 0
            all_paydays = set(
                paydays(
                    schedule.frequency,
                    schedule.next_payday,
                    cycle.start,
                    cycle.end,
                    schedule.interval_days,
                )
            )
            days = forecast(
                cycle, today, self._spendable_cents(), actual, projected, all_paydays, daily
            )
            lowest = min(days, key=lambda item: item.end_cents)
            current = next(item for item in cycles if item.offset == 0)
            next_payday = current.end + timedelta(days=1)
            return ForecastResponse(
                cycles=[_pay_cycle(item) for item in cycles],
                cycle=_pay_cycle(cycle),
                mode=mode,
                days=[_forecast_day(item) for item in days],
                starting_cents=days[0].start_cents,
                ending_cents=days[-1].end_cents,
                lowest_day=lowest.day,
                lowest_cents=lowest.end_cents,
                next_payday=next_payday,
                days_until_payday=(next_payday - today).days,
                daily_budget_cents=daily,
                tight_threshold_cents=TIGHT_THRESHOLD_CENTS,
                review=self._cycle_review(cycle, cycles) if cycle.end < today else None,
                methodology=(
                    "Past days use your recorded transactions in chequing and cash accounts. "
                    "Future days add expected paydays and subtract scheduled bills on their "
                    "due dates; budget mode also sets aside your daily flexible allowance. "
                    f"Days under {format_cad(TIGHT_THRESHOLD_CENTS)} are tight."
                ),
            )

    def _cycle_review(self, cycle: Cycle, cycles: list[Cycle]) -> CycleReview:
        def rows(start: date, end: date) -> list[Transaction]:
            return [t for t in self._transactions.values() if start <= t.occurred_on <= end]

        current = rows(cycle.start, cycle.end)
        spending = [t for t in current if t.kind == "spending"]
        biggest = max(spending, key=lambda t: t.amount_cents, default=None)
        length = (cycle.end - cycle.start).days + 1
        before = rows(cycle.start - timedelta(days=length), cycle.start - timedelta(days=1))
        return CycleReview(
            income_cents=sum(t.amount_cents for t in current if t.kind == "income"),
            spent_cents=sum(t.amount_cents for t in spending),
            biggest_expense_name=biggest.description if biggest else None,
            biggest_expense_cents=biggest.amount_cents if biggest else None,
            previous_spent_cents=(
                sum(t.amount_cents for t in before if t.kind == "spending") if before else None
            ),
        )

    # ------------------------------------------------------------------ categories and accounts

    def create_category(self, user_id: str, request: CategoryWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            name = request.name.strip()
            if any(
                c.kind == request.kind and c.name.casefold() == name.casefold()
                for c in self._categories.values()
            ):
                raise HTTPException(status.HTTP_409_CONFLICT, "That category already exists")
            if request.parent_id:
                parent = self._category(request.parent_id)
                if parent.parent_id or parent.kind != request.kind:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_CONTENT,
                        "A subcategory needs a top-level parent of the same type",
                    )
            category = Category(
                id=f"cat-{uuid4().hex[:10]}",
                name=name,
                colour_token="slate" if request.kind == "spending" else "emerald",
                kind=request.kind,
                parent_id=request.parent_id,
                custom=True,
            )
            self._categories[category.id] = category
            return self._snapshot()

    def delete_category(self, user_id: str, category_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            self._category(category_id)
            in_use = (
                any(t.category_id == category_id for t in self._transactions.values())
                or any(b["category_id"] == category_id for b in self._budgets.values())
                or any(b.category_id == category_id for b in self._bills.values())
                or any(c.parent_id == category_id for c in self._categories.values())
            )
            if in_use:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This category is in use. Move its transactions, budgets, bills, and "
                    "subcategories first.",
                )
            del self._categories[category_id]
            return self._snapshot()

    def create_account(self, user_id: str, request: AccountWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if (request.account_type == "credit") != (request.credit_limit_cents is not None):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "Credit accounts need a credit limit; other accounts can't have one",
                )
            account = Account(id=f"acct-{uuid4().hex[:10]}", **request.model_dump())
            self._accounts[account.id] = account
            return self._snapshot()

    def rename_account(self, user_id: str, account_id: str, name: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            account = self._accounts.get(account_id)
            if not account:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
            self._accounts[account_id] = account.model_copy(update={"name": name.strip()})
            return self._snapshot()

    def delete_account(self, user_id: str, account_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if account_id not in self._accounts:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
            in_use = any(t.account_id == account_id for t in self._transactions.values()) or any(
                b.account_id == account_id for b in self._bills.values()
            )
            if in_use or (self._pay_schedule and self._pay_schedule.account_id == account_id):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This account has transactions, bills, or your paycheque. Move them first.",
                )
            del self._accounts[account_id]
            return self._snapshot()

    # ------------------------------------------------------------------ CSV import

    def import_csv(self, user_id: str, text: str, account_id: str) -> tuple[int, list[str]]:
        """Adds history from a spreadsheet. Imported rows do not change account balances."""
        with self._lock:
            self.require_owner(user_id)
            if account_id not in self._accounts:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
            rows, errors = parse_transactions_csv(text, self.today())
            existing = {
                (t.occurred_on, t.description.casefold(), t.amount_cents, t.kind)
                for t in self._transactions.values()
            }
            names = {c.name.casefold(): c for c in self._categories.values()}
            imported = 0
            for row in rows:
                key = (row.occurred_on, row.description.casefold(), row.amount_cents, row.kind)
                if key in existing:
                    errors.append(f"Line {row.line}: duplicate of an existing transaction")
                    continue
                category = names.get((row.category or "").casefold())
                if category and category.kind != row.kind:
                    category = None
                category_id = (
                    category.id if category else categorize(row.description, row.kind).category_id
                )
                transaction = Transaction(
                    id=f"tx-{uuid4().hex[:12]}",
                    description=row.description,
                    category=self._category_name(category_id),
                    account_id=account_id,
                    category_id=category_id,
                    amount_cents=row.amount_cents,
                    kind=row.kind,
                    occurred_on=row.occurred_on,
                    auto_categorized=category is None and category_id is not None,
                )
                self._transactions[transaction.id] = transaction
                existing.add(key)
                imported += 1
            return imported, errors

    def is_owner(self, user_id: str) -> bool:
        return user_id in self._owner_user_ids

    def require_owner(self, user_id: str) -> None:
        if not self.is_owner(user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Financial context is not available")

    def dashboard_for_user(self, user_id: str, month: date | None = None) -> DashboardResponse:
        self.require_owner(user_id)
        with self._lock:
            self._auto_record_due_bills()
        if month and month_start(month) > self.active_month:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That month is in the future"
            )
        return self._snapshot(month)

    def _period(self, start: date, end: date) -> Period:
        try:
            name = describe_period(start, end, self.active_month)
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
        return Period(
            start=start,
            end=end,
            label=name.label,
            phrase=name.phrase,
            single_month=name.single_month,
            month_count=len(name.months),
        )

    def dashboard_for_range(self, user_id: str, start: date, end: date) -> DashboardResponse:
        """A snapshot whose spending figures cover [start, end]; balances stay as of today."""
        period = self._period(start, end)
        if end > month_end(self.active_month):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That period is in the future"
            )
        if period.single_month:
            return self.dashboard_for_user(user_id, start)
        base = self.dashboard_for_user(user_id, month_start(end))
        with self._lock:
            rows = self._flag_unusual(
                sorted(
                    (
                        self._with_necessity(t)
                        for t in self._transactions.values()
                        if start <= t.occurred_on <= end
                    ),
                    key=lambda item: item.occurred_on,
                    reverse=True,
                )
            )
            months = months_between(start, end)
            # A month only partly inside the period counts for its share of days (floored).
            month_budgets = [
                {**b, "limit_cents": b["limit_cents"] * overlap // month_end(m).day}
                for m in months
                for b in self._monthly_budgets(m)
                if (overlap := (min(end, month_end(m)) - max(start, m)).days + 1)
            ]
            total_budget = sum(item["limit_cents"] for item in month_budgets)
            summary = build_summary(
                [TransactionAmount(t.amount_cents, TransactionKind(t.kind)) for t in rows],
                total_budget,
                [],
            )
            spending_by_category, breakdown = self._category_breakdown(rows)
            budgets = self._combined_budgets(month_budgets, rows, spending_by_category, start)
            needs = sum(t.amount_cents for t in rows if t.necessity == "need")
            wants = sum(t.amount_cents for t in rows if t.necessity == "want")
            length = (end - start).days + 1
            before = [
                t
                for t in self._transactions.values()
                if start - timedelta(days=length) <= t.occurred_on < start
            ]
            previous_spending = sum(t.amount_cents for t in before if t.kind == "spending")
            return base.model_copy(
                update={
                    "period": period,
                    "transactions": rows,
                    "budgets": budgets,
                    "category_spending": breakdown,
                    "spending_classification": SpendingClassification(
                        needs_cents=needs,
                        wants_cents=wants,
                        needs_basis_points=share_basis_points(needs, needs + wants),
                        wants_basis_points=share_basis_points(wants, needs + wants),
                    ),
                    "totals": DashboardTotals(
                        **asdict(summary),
                        available_balance_cents=base.totals.available_balance_cents,
                        total_budget_cents=total_budget,
                        savings_rate_basis_points=(
                            summary.cash_flow_cents * 10_000 // summary.income_cents
                            if summary.income_cents
                            else 0
                        ),
                    ),
                    "home": base.home.model_copy(
                        update={
                            "monthly_saved_cents": summary.cash_flow_cents,
                            "monthly_goal_cents": base.home.monthly_goal_cents * len(months),
                            "spending_change_basis_points": (
                                (summary.spending_cents - previous_spending)
                                * 10_000
                                // previous_spending
                                if previous_spending
                                else None
                            ),
                        }
                    ),
                }
            )

    def _combined_budgets(
        self,
        month_budgets: list[dict],
        rows: list[Transaction],
        spending_by_category: dict[str | None, int],
        start: date,
    ) -> list[MonthlyBudget]:
        """One row per category, limits summed across the months in the period."""
        limits: dict[str, int] = {}
        for item in month_budgets:
            limits[item["category_id"]] = limits.get(item["category_id"], 0) + item["limit_cents"]
        combined = []
        for category_id, limit in limits.items():
            category = self._categories[category_id]
            spent = (
                sum(
                    t.amount_cents
                    for t in rows
                    if t.kind == "spending" and t.category_id == category_id
                )
                if category.parent_id
                else spending_by_category.get(category_id, 0)
            )
            combined.append(
                MonthlyBudget(
                    id=f"period-{category_id}",
                    category_id=category_id,
                    category_name=category.name,
                    month_start=start.replace(day=1),
                    limit_cents=limit,
                    spent_cents=spent,
                    remaining_cents=limit - spent,
                    usage_basis_points=spent * 10_000 // limit if limit else 0,
                )
            )
        return sorted(combined, key=lambda item: item.category_name)

    def goal_for_user(self, user_id: str, goal_id: str) -> Goal:
        dashboard = self.dashboard_for_user(user_id)
        goal = next((item for item in dashboard.savings_goals if item.id == goal_id), None)
        if not goal:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
        return goal

    def apply_approved_goal_contribution(
        self,
        user_id: str,
        goal_id: str,
        expected_current_cents: int,
        contribution_cents: int,
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal = self._goals.get(goal_id)
            if not goal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            if goal["current_cents"] != expected_current_cents:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "Savings goal changed after this proposal was created",
                )
            if contribution_cents <= 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid contribution")
            amount = min(contribution_cents, goal["target_cents"] - goal["current_cents"])
            self._move_into_goal(goal, amount, self._default_source(), "penny")
            return self._snapshot()

    def apply_approved_budget_limit(
        self,
        user_id: str,
        budget_id: str,
        expected_limit_cents: int,
        new_limit_cents: int,
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            budget = self._budgets.get(budget_id)
            if not budget:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            if budget["limit_cents"] != expected_limit_cents:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "Budget changed after this proposal was created"
                )
            if new_limit_cents < 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid budget limit")
            budget["limit_cents"] = new_limit_cents
            return self._snapshot()

    def _new_transaction(
        self,
        description: str,
        category_id: str | None,
        account_id: str,
        amount_cents: int,
        kind: Literal["income", "spending"],
        occurred_on: date,
    ) -> Transaction:
        """A validated, not-yet-saved transaction; picks a category when none is given."""
        self._validate_transaction_references(account_id, category_id, kind)
        auto = category_id is None
        if auto:
            category_id = categorize(description, kind).category_id
        return Transaction(
            id=f"tx-{uuid4().hex[:12]}",
            description=description,
            category=self._category_name(category_id),
            account_id=account_id,
            category_id=category_id,
            auto_categorized=auto and category_id is not None,
            amount_cents=amount_cents,
            kind=kind,
            occurred_on=occurred_on,
        )

    def create_transaction(self, user_id: str, request: TransactionWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            transaction = self._new_transaction(
                request.description,
                request.category_id,
                request.account_id,
                request.amount_cents,
                request.kind,
                request.occurred_on,
            )
            bill = self._bill_from(transaction, request.repeat) if request.repeat else None
            self._apply_account_effect(transaction, 1)
            if bill:
                self._bills[bill.id] = bill
                transaction = transaction.model_copy(update={"bill_id": bill.id})
            self._transactions[transaction.id] = transaction
            return self._snapshot()

    def _bill_from(self, transaction: Transaction, repeat: TransactionRepeat) -> Bill:
        """A recurring bill that starts with this transaction as its first payment."""
        if transaction.kind != "spending":
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Only money out can repeat. Set up your paycheque in Settings.",
            )
        next_due = repeat.next_due or next_due_after(transaction.occurred_on, repeat.frequency)
        if next_due <= transaction.occurred_on:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "The next payment must be after this one"
            )
        return Bill(
            id=f"bill-{uuid4().hex[:10]}",
            name=transaction.description,
            amount_cents=transaction.amount_cents,
            category_id=transaction.category_id,
            account_id=transaction.account_id,
            frequency=repeat.frequency,
            next_due=next_due,
            auto_record=repeat.auto_record,
            last_paid_on=transaction.occurred_on,
        )

    def create_split_transaction(
        self, user_id: str, request: SplitTransactionWrite
    ) -> DashboardResponse:
        """Saves one transaction per account, all or nothing."""
        with self._lock:
            self.require_owner(user_id)
            transactions = [
                self._new_transaction(
                    request.description,
                    request.category_id,
                    split.account_id,
                    split.amount_cents,
                    request.kind,
                    request.occurred_on,
                )
                for split in request.splits
            ]
            accounts_before = self._accounts.copy()
            try:
                for transaction in transactions:
                    self._apply_account_effect(transaction, 1)
            except HTTPException:
                self._accounts = accounts_before
                raise
            self._transactions.update({item.id: item for item in transactions})
            return self._snapshot()

    def update_transaction(
        self, user_id: str, transaction_id: str, request: TransactionPatch
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            existing = self._transaction(transaction_id)
            values = request.model_dump(exclude_unset=True)
            account_id = values.get("account_id", existing.account_id)
            category_id = values.get("category_id", existing.category_id)
            self._validate_transaction_references(
                account_id, category_id, values.get("kind", existing.kind)
            )
            accounts_before = self._accounts.copy()
            try:
                self._apply_account_effect(existing, -1)
                updated = existing.model_copy(
                    update={
                        **values,
                        "category": self._category_name(category_id),
                    }
                )
                self._apply_account_effect(updated, 1)
            except Exception:
                self._accounts = accounts_before
                raise
            self._transactions[transaction_id] = updated
            return self._snapshot()

    def delete_transaction(self, user_id: str, transaction_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            existing = self._transaction(transaction_id)
            self._apply_account_effect(existing, -1)
            del self._transactions[transaction_id]
            return self._snapshot()

    def create_budget(self, user_id: str, request: BudgetWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            self._category(request.category_id)
            if request.month_start.day != 1:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "month_start must be the first of a month",
                )
            if any(
                item["category_id"] == request.category_id
                and item["month_start"] == request.month_start
                for item in self._budgets.values()
            ):
                raise HTTPException(status.HTTP_409_CONFLICT, "Budget already exists")
            budget_id = f"budget-{uuid4().hex[:12]}"
            self._budgets[budget_id] = {"id": budget_id, **request.model_dump()}
            return self._snapshot()

    def update_budget(
        self, user_id: str, budget_id: str, request: BudgetPatch
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if budget_id not in self._budgets:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            self._budgets[budget_id]["limit_cents"] = request.limit_cents
            return self._snapshot()

    def delete_budget(self, user_id: str, budget_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if self._budgets.pop(budget_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            return self._snapshot()

    def create_goal(self, user_id: str, request: GoalWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal_id = f"goal-{uuid4().hex[:12]}"
            values = request.model_dump()
            # Keep new goals in savings unless the user picks another account.
            if values["account_id"] is None:
                savings = next(iter(self._accounts_of("savings")), None)
                values["account_id"] = savings.id if savings else None
            elif values["account_id"] not in self._accounts:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
            self._goals[goal_id] = {"id": goal_id, **values, "status": "active"}
            return self._snapshot()

    def update_goal(self, user_id: str, goal_id: str, request: GoalPatch) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if goal_id not in self._goals:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            self._goals[goal_id].update(request.model_dump(exclude_unset=True))
            return self._snapshot()

    def delete_goal(self, user_id: str, goal_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if self._goals.pop(goal_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            return self._snapshot()

    def _transaction(self, transaction_id: str) -> Transaction:
        transaction = self._transactions.get(transaction_id)
        if not transaction:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
        return transaction

    def _category(self, category_id: str) -> Category:
        category = self._categories.get(category_id)
        if not category:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown category")
        return category

    def _category_name(self, category_id: str | None) -> str:
        return self._category(category_id).name if category_id else "Uncategorized"

    def _validate_transaction_references(
        self, account_id: str, category_id: str | None, kind: str | None = None
    ) -> None:
        if account_id not in self._accounts:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
        if category_id:
            category = self._category(category_id)
            if kind and category.kind != kind:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"“{category.name}” is a {category.kind} category",
                )

    def _apply_account_effect(self, transaction: Transaction, multiplier: int) -> None:
        account = self._accounts[transaction.account_id]
        direction = 1 if transaction.kind == "income" else -1
        if account.account_type == "credit":
            direction *= -1
        new_balance = account.balance_cents + transaction.amount_cents * direction * multiplier
        if new_balance < 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Transaction would make the account balance negative",
            )
        self._accounts[account.id] = account.model_copy(update={"balance_cents": new_balance})


def _configured_owner_ids() -> tuple[str, ...]:
    owner = get_settings().demo_owner_user_id
    return (owner,) if owner else ()


dashboard_store = DashboardStore(owner_user_ids=_configured_owner_ids())

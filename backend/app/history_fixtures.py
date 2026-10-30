# ruff: noqa: E501 - the history table is intentionally one row per month.
"""Fictional, deterministic history for the demo user (September 2025 - September 2026).

Every amount is invented integer cents for Maya Singh, a fictional student. The table is
fixed so totals, tests, and charts are reproducible. October 2026 (the demo's current
month) lives in `fixtures.py` and is not repeated here.
"""

from dataclasses import dataclass
from datetime import date

from app.models import Transaction

RENT_CENTS = 82_500
BUDGET_LIMITS_CENTS = {
    "cat-housing": 85_000,
    "cat-food": 30_000,
    "cat-transport": 10_000,
    "cat-phone": 5_000,
    "cat-school": 10_000,
    "cat-fun": 8_000,
}


@dataclass(frozen=True, slots=True)
class MonthPlan:
    month: date
    pay: int
    pay_label: str
    extra_income: int
    extra_label: str
    food: int
    transport: int
    school: int
    fun: int
    fun_label: str
    health: int


# fmt: off
HISTORY: tuple[MonthPlan, ...] = (
    MonthPlan(date(2025, 9, 1), 98_000, "Harbour Books pay", 50_000, "Student scholarship", 27_450, 7_800, 31_240, 4_200, "Frosh week event", 0),
    MonthPlan(date(2025, 10, 1), 102_300, "Harbour Books pay", 0, "", 24_880, 7_800, 2_150, 5_600, "Movie night", 1_299),
    MonthPlan(date(2025, 11, 1), 99_800, "Harbour Books pay", 0, "", 26_310, 7_800, 1_875, 3_400, "Board game café", 0),
    MonthPlan(date(2025, 12, 1), 118_600, "Harbour Books holiday shifts", 10_000, "Holiday gift from family", 31_920, 7_800, 0, 12_350, "Holiday gifts", 0),
    MonthPlan(date(2026, 1, 1), 96_400, "Harbour Books pay", 50_000, "Student scholarship", 25_770, 7_800, 28_960, 3_150, "Skating rental", 2_450),
    MonthPlan(date(2026, 2, 1), 101_200, "Harbour Books pay", 0, "", 23_940, 7_800, 1_499, 6_800, "Concert ticket", 0),
    MonthPlan(date(2026, 3, 1), 104_500, "Harbour Books pay", 0, "", 25_310, 7_800, 3_250, 4_100, "Movie night", 0),
    MonthPlan(date(2026, 4, 1), 112_900, "Harbour Books pay", 0, "", 24_660, 7_800, 0, 5_250, "End-of-term dinner", 1_850),
    MonthPlan(date(2026, 5, 1), 186_000, "Summer camp counsellor pay", 0, "", 21_480, 9_600, 0, 8_900, "Beach day trip", 0),
    MonthPlan(date(2026, 6, 1), 192_400, "Summer camp counsellor pay", 0, "", 22_370, 9_600, 0, 11_200, "Music festival pass", 0),
    MonthPlan(date(2026, 7, 1), 188_750, "Summer camp counsellor pay", 0, "", 23_150, 9_600, 0, 9_450, "Canada Day outing", 3_200),
    MonthPlan(date(2026, 8, 1), 179_300, "Summer camp counsellor pay", 0, "", 22_890, 9_600, 0, 7_300, "Movie night", 0),
    MonthPlan(date(2026, 9, 1), 121_600, "Harbour Books pay", 50_000, "Student scholarship", 26_740, 7_800, 29_880, 4_650, "Frosh week event", 0),
)
# fmt: on


def _on(month: date, day: int) -> date:
    return month.replace(day=day)


def build_history_transactions() -> list[Transaction]:
    """Expands the monthly table into individual fictional transactions on the chequing account."""
    items: list[Transaction] = []

    def add(
        plan: MonthPlan,
        slug: str,
        day: int,
        description: str,
        category: str,
        amount: int,
        kind: str,
    ) -> None:
        if amount <= 0:
            return
        items.append(
            Transaction(
                id=f"tx-{plan.month:%Y%m}-{slug}",
                description=description,
                category=category,
                account_id="acct-chequing",
                category_id=f"cat-{category.lower()}"
                if category != "Transportation"
                else "cat-transport",
                amount_cents=amount,
                kind=kind,  # type: ignore[arg-type]
                occurred_on=_on(plan.month, day),
            )
        )

    for plan in HISTORY:
        groceries = plan.food * 7 // 10
        add(plan, "pay", 25, plan.pay_label, "Income", plan.pay, "income")
        add(plan, "extra", 2, plan.extra_label, "Income", plan.extra_income, "income")
        add(plan, "rent", 1, "Fictional student housing", "Housing", RENT_CENTS, "spending")
        add(plan, "groceries", 12, "Atlantic Market", "Food", groceries, "spending")
        add(plan, "cafe", 20, "Campus café", "Food", plan.food - groceries, "spending")
        add(
            plan, "transit", 3, "Halifax Transit pass", "Transportation", plan.transport, "spending"
        )
        add(plan, "phone", 14, "Mobile plan", "Phone", 4_500, "spending")
        add(plan, "school", 8, "Course materials", "School", plan.school, "spending")
        add(plan, "fun", 17, plan.fun_label, "Fun", plan.fun, "spending")
        add(plan, "health", 11, "Pharmacy", "Health", plan.health, "spending")
    return items


def build_history_budgets() -> list[dict[str, object]]:
    """The same fictional monthly plan for every historical month."""
    return [
        {
            "id": f"budget-{plan.month:%Y%m}-{category_id.removeprefix('cat-')}",
            "category_id": category_id,
            "month_start": plan.month,
            "limit_cents": limit,
        }
        for plan in HISTORY
        for category_id, limit in BUDGET_LIMITS_CENTS.items()
    ]

from dataclasses import asdict
from datetime import date

from app.domain.finance import TransactionAmount, TransactionKind, build_summary
from app.models import (
    Account,
    Budget,
    DemoDashboardResponse,
    DemoUser,
    SavingsGoal,
    Summary,
    Transaction,
)


def build_demo_dashboard() -> DemoDashboardResponse:
    transactions = [
        Transaction(
            id="tx-pay",
            description="Harbour Books pay",
            category="Income",
            amount_cents=126_400,
            kind="income",
            occurred_on=date(2026, 10, 25),
        ),
        Transaction(
            id="tx-scholarship",
            description="Student scholarship",
            category="Income",
            amount_cents=50_000,
            kind="income",
            occurred_on=date(2026, 10, 2),
        ),
        Transaction(
            id="tx-rent",
            description="Fictional student housing",
            category="Housing",
            amount_cents=82_500,
            kind="spending",
            occurred_on=date(2026, 10, 1),
        ),
        Transaction(
            id="tx-groceries",
            description="Atlantic Market",
            category="Food",
            amount_cents=18_942,
            kind="spending",
            occurred_on=date(2026, 10, 22),
        ),
        Transaction(
            id="tx-transit",
            description="Halifax Transit pass",
            category="Transportation",
            amount_cents=7_800,
            kind="spending",
            occurred_on=date(2026, 10, 3),
        ),
        Transaction(
            id="tx-dining",
            description="Campus café",
            category="Food",
            amount_cents=6_875,
            kind="spending",
            occurred_on=date(2026, 10, 19),
        ),
        Transaction(
            id="tx-phone",
            description="Mobile plan",
            category="Phone",
            amount_cents=4_500,
            kind="spending",
            occurred_on=date(2026, 10, 14),
        ),
        Transaction(
            id="tx-school",
            description="Course materials",
            category="School",
            amount_cents=3_299,
            kind="spending",
            occurred_on=date(2026, 10, 10),
        ),
        Transaction(
            id="tx-fun",
            description="Movie night",
            category="Fun",
            amount_cents=2_600,
            kind="spending",
            occurred_on=date(2026, 10, 17),
        ),
    ]
    domain_transactions = [
        TransactionAmount(
            amount_cents=item.amount_cents,
            kind=TransactionKind(item.kind),
        )
        for item in transactions
    ]
    summary = build_summary(domain_transactions, 148_000, [15_000])
    budgets = [
        Budget(category="Housing", limit_cents=85_000, spent_cents=82_500, remaining_cents=2_500),
        Budget(category="Food", limit_cents=30_000, spent_cents=25_817, remaining_cents=4_183),
        Budget(
            category="Transportation", limit_cents=10_000, spent_cents=7_800, remaining_cents=2_200
        ),
        Budget(category="Phone", limit_cents=5_000, spent_cents=4_500, remaining_cents=500),
        Budget(category="School", limit_cents=10_000, spent_cents=3_299, remaining_cents=6_701),
        Budget(category="Fun", limit_cents=8_000, spent_cents=2_600, remaining_cents=5_400),
    ]
    return DemoDashboardResponse(
        profile=DemoUser(
            id="demo-maya-singh",
            display_name="Maya Singh",
            age=20,
            school="Dalhousie University",
            city="Halifax",
            province="NS",
            currency="CAD",
            is_fictional=True,
        ),
        accounts=[
            Account(
                id="acct-chequing",
                name="Everyday Chequing",
                account_type="chequing",
                balance_cents=184_250,
            ),
            Account(
                id="acct-savings",
                name="High Interest Savings",
                account_type="savings",
                balance_cents=125_000,
            ),
            Account(
                id="acct-credit",
                name="Student Credit Card",
                account_type="credit",
                balance_cents=24_380,
                credit_limit_cents=150_000,
            ),
        ],
        transactions=transactions,
        budgets=budgets,
        savings_goal=SavingsGoal(
            name="Winter emergency fund",
            target_cents=250_000,
            current_cents=125_000,
            contribution_this_month_cents=15_000,
            target_date=date(2027, 2, 28),
        ),
        summary=Summary(**asdict(summary)),
    )

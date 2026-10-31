"""The user's financial picture as the coach sees it: a snapshot plus check-in signals.

Every figure placed in the snapshot is registered in the FactBook, so the model can quote it.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from app.coach.facts import FactBook
from app.coach.models import Proposal, Signal, ToolUse
from app.dashboard_models import DashboardResponse, Goal, HistoryResponse, MonthlyBudget
from app.dashboard_store import DashboardStore
from app.domain.finance import COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS, add_months

PRIOR_MONTHS = 3
# A category is "running hot" when this month is at least 125% of its recent average.
HOT_CATEGORY_BASIS_POINTS = 12_500
# ...and at least this much above it, so small categories don't raise noise over a few dollars.
HOT_CATEGORY_MIN_EXTRA_CENTS = 2_500
BUDGET_WATCH_BASIS_POINTS = 8_500

Tone = Literal["positive", "watch", "alert"]


@dataclass
class CoachContext:
    store: DashboardStore
    user_id: str
    dashboard: DashboardResponse
    prior: HistoryResponse
    facts: FactBook = field(default_factory=FactBook)
    tools_used: list[ToolUse] = field(default_factory=list)
    proposal: Proposal | None = None

    @property
    def month(self) -> date:
        return self.dashboard.active_month

    def account_total(self, account_type: str) -> int:
        return sum(
            item.balance_cents
            for item in self.dashboard.accounts
            if item.account_type == account_type
        )

    @property
    def unpaid_bills_cents(self) -> int:
        """Scheduled bills due between today and the next payday."""
        return self.dashboard.recurring.due_before_payday_cents

    @property
    def typical_surplus_cents(self) -> int:
        """Average monthly income minus spending over the prior months, or this month's."""
        active = self.prior.totals.months_with_activity
        if active:
            return self.prior.totals.cash_flow_cents // active
        return self.dashboard.totals.cash_flow_cents

    def category_average_cents(self, category_name: str) -> int | None:
        active = self.prior.totals.months_with_activity
        spent = next(
            (c.spent_cents for c in self.prior.categories if c.category_name == category_name),
            None,
        )
        return spent // active if spent is not None and active else None

    def find_goal(self, key: str) -> Goal | None:
        needle = key.strip().casefold()
        return next(
            (
                goal
                for goal in self.dashboard.savings_goals
                if goal.id.casefold() == needle or needle in goal.name.casefold()
            ),
            None,
        )

    def find_budget(self, category: str) -> MonthlyBudget | None:
        needle = category.strip().casefold()
        return next(
            (b for b in self.dashboard.budgets if b.category_name.casefold() == needle), None
        )


def load_context(store: DashboardStore, user_id: str) -> CoachContext:
    dashboard = store.dashboard_for_user(user_id)
    prior = store.history_for_user(
        user_id,
        add_months(dashboard.active_month, -PRIOR_MONTHS),
        add_months(dashboard.active_month, -1),
    )
    return CoachContext(store=store, user_id=user_id, dashboard=dashboard, prior=prior)


def month_label(month: date) -> str:
    return month.strftime("%B %Y")


def goal_monthly_needed(goal: Goal) -> int | None:
    return goal.monthly_needed_cents if goal.status == "active" else None


def pay_cycle_snapshot(ctx: CoachContext) -> dict[str, object] | None:
    """Next payday and the lowest projected balance before it (bills only)."""
    if not ctx.dashboard.pay_schedule:
        return None
    f = ctx.facts
    view = ctx.store.forecast(ctx.user_id, 0, "bills")
    return {
        "next_payday": view.next_payday.isoformat(),
        "days_until_payday": view.days_until_payday,
        "chequing_and_cash_at_cycle_start": f.money(
            "Cash at start of pay cycle", view.starting_cents, "forecast"
        ),
        "lowest_projected_balance": f.money(
            "Lowest balance before payday", view.lowest_cents, "forecast"
        ),
        "lowest_projected_day": view.lowest_day.isoformat(),
        "projected_balance_day_before_payday": f.money(
            "Balance the day before payday", view.ending_cents, "forecast"
        ),
        "note": "Projection subtracts scheduled bills only, not everyday spending.",
    }


def build_snapshot(ctx: CoachContext) -> dict[str, object]:
    """Model-facing JSON of the user's month. Amounts are pre-formatted CAD strings."""
    d, f = ctx.dashboard, ctx.facts
    totals = d.totals
    budgets = [
        {
            "category": b.category_name,
            "limit": f.money(f"{b.category_name} budget", b.limit_cents, "budgets"),
            "spent": f.money(f"{b.category_name} spent this month", b.spent_cents, "budgets"),
            "remaining": f.money(f"{b.category_name} budget left", b.remaining_cents, "budgets"),
            "used": f.percent(f"{b.category_name} budget used", b.usage_basis_points, "budgets"),
        }
        for b in d.budgets
    ]
    categories = []
    for item in d.category_spending:
        average = ctx.category_average_cents(item.category_name)
        categories.append(
            {
                "category": item.category_name,
                "spent_this_month": f.money(
                    f"{item.category_name} spent this month", item.spent_cents, "transactions"
                ),
                "share_of_spending": f.percent(
                    f"{item.category_name} share of spending",
                    item.share_basis_points,
                    "transactions",
                ),
                "monthly_average_prior_3_months": (
                    f.money(f"{item.category_name} 3-month average", average, "history")
                    if average is not None
                    else None
                ),
            }
        )
    goals = []
    for goal in d.savings_goals:
        needed = goal_monthly_needed(goal)
        goals.append(
            {
                "id": goal.id,
                "name": goal.name,
                "status": goal.status,
                "target": f.money(f"{goal.name} target", goal.target_cents, "goals"),
                "saved": f.money(f"{goal.name} saved", goal.current_cents, "goals"),
                "still_needed": f.money(
                    f"{goal.name} still needed",
                    max(0, goal.target_cents - goal.current_cents),
                    "goals",
                ),
                "progress": f.percent(f"{goal.name} progress", goal.progress_basis_points, "goals"),
                "target_date": goal.target_date.isoformat() if goal.target_date else None,
                "monthly_needed_to_hit_target_date": (
                    f.money(f"Monthly saving needed for {goal.name}", needed, "goals")
                    if needed is not None
                    else None
                ),
            }
        )
    previous = d.previous_month_cash_flow_cents
    return {
        "data_notice": "Fictional demo data. Amounts are CAD.",
        "month": month_label(ctx.month),
        "person": {
            "first_name": d.profile.display_name.split()[0],
            "school": d.profile.school,
            "city": d.profile.city,
            "province": d.profile.province,
        },
        "this_month": {
            "income": f.money("Income this month", totals.income_cents, "transactions"),
            "spending": f.money("Spending this month", totals.spending_cents, "transactions"),
            "cash_flow": f.money("Cash flow this month", totals.cash_flow_cents, "transactions"),
            "savings_rate": f.percent(
                "Savings rate this month", totals.savings_rate_basis_points, "transactions"
            ),
            "total_budget": f.money("Total monthly budget", totals.total_budget_cents, "budgets"),
            "budget_left": f.money("Budget left", totals.budget_remaining_cents, "budgets"),
            "safe_to_spend": f.money("Safe to spend", d.spending_power_cents, "dashboard"),
            "last_month_cash_flow": (
                f.money("Last month's cash flow", previous, "history")
                if previous is not None
                else None
            ),
        },
        "typical_monthly_surplus": f.money(
            "Typical monthly surplus (3-month average)", ctx.typical_surplus_cents, "history"
        ),
        "prior_3_months_average_spending": f.money(
            "Average monthly spending (prior 3 months)",
            ctx.prior.totals.average_spending_cents,
            "history",
        ),
        "accounts": [
            {
                "name": a.name,
                "type": a.account_type,
                "balance": f.money(f"{a.name} balance", a.balance_cents, "accounts"),
                "credit_limit": (
                    f.money(f"{a.name} limit", a.credit_limit_cents, "accounts")
                    if a.credit_limit_cents
                    else None
                ),
            }
            for a in d.accounts
        ],
        "budgets": budgets,
        "spending_by_category": categories,
        "needs_vs_wants": {
            "needs": f.money("Needs spending", d.spending_classification.needs_cents, "dashboard"),
            "wants": f.money("Wants spending", d.spending_classification.wants_cents, "dashboard"),
            "wants_share": f.percent(
                "Wants share of spending", d.spending_classification.wants_basis_points, "dashboard"
            ),
        },
        "scheduled_bills": [
            {
                "name": bill.name,
                "amount": f.money(bill.name, bill.amount_cents, "bills"),
                "frequency": bill.frequency,
                "next_due": bill.next_due.isoformat(),
                "paid_automatically": bill.auto_record,
            }
            for bill in d.bills
        ],
        "bills_due_before_next_payday": f.money(
            "Bills due before payday", ctx.unpaid_bills_cents, "bills"
        ),
        "pay_cycle": pay_cycle_snapshot(ctx),
        "savings_goals": goals,
        "credit_card": (
            {
                "balance": f.money("Credit card balance", d.credit.balance_cents, "accounts"),
                "limit": f.money("Credit limit", d.credit.credit_limit_cents, "accounts"),
                "utilization": f.percent(
                    "Credit utilization", d.credit.utilization_basis_points, "accounts"
                ),
                "common_guideline": f.percent(
                    "Common utilization guideline",
                    COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS,
                    "education",
                ),
            }
            if d.credit
            else None
        ),
        "net_worth": f.money("Net worth", d.net_worth.net_worth_cents, "accounts"),
        "financial_health_score": {
            "score_out_of_100": d.financial_health.score,
            "factors": [
                {"label": x.label, "score": x.score, "max": x.max_score}
                for x in d.financial_health.factors
            ],
        },
        "recent_transactions": [
            {
                "date": t.occurred_on.isoformat(),
                "description": t.description,
                "category": t.category,
                "kind": t.kind,
                "amount": f.money(t.description, t.amount_cents, "transactions"),
            }
            for t in d.transactions[:15]
        ],
        "goal_ids": [goal.id for goal in d.savings_goals],
        "fixed_monthly_expenses": {
            "total": f.money(
                "Fixed monthly expenses", d.recurring.fixed_monthly_cents, "recurring"
            ),
            "items": [
                {
                    "name": item.name,
                    "amount": f.money(item.name, item.amount_cents, "recurring"),
                    "next_due": item.next_due.isoformat(),
                    "type": item.kind,
                }
                for item in d.recurring.items
            ],
        },
        "daily_money_score": {
            "today": d.money_calendar.today_score,
            "zone": d.money_calendar.today_zone,
            "green_streak_days": d.money_calendar.streaks.current_green,
            "no_spend_days_this_month": d.money_calendar.streaks.no_spend_days,
            "daily_flexible_allowance": f.money(
                "Daily flexible allowance", d.money_calendar.daily_allowance_cents, "money_score"
            ),
            "how_it_works": d.money_calendar.methodology,
        },
    }


def build_signals(ctx: CoachContext) -> list[Signal]:
    """Deterministic check-in items, most urgent first."""
    d, f = ctx.dashboard, ctx.facts
    signals: list[Signal] = []

    def add(id: str, tone: Tone, title: str, detail: str, prompt: str) -> None:
        signals.append(Signal(id=id, tone=tone, title=title, detail=detail, prompt=prompt))

    cash_flow = f.money("Cash flow this month", d.totals.cash_flow_cents, "transactions")
    if d.totals.cash_flow_cents < 0:
        add(
            "cash-flow",
            "alert",
            "Spending is ahead of income",
            f"You're {cash_flow.lstrip('-')} short this month so far.",
            "How do I get back to positive cash flow this month?",
        )
    else:
        rate = f.percent(
            "Savings rate this month", d.totals.savings_rate_basis_points, "transactions"
        )
        add(
            "cash-flow",
            "positive",
            "You're keeping money this month",
            f"{cash_flow} left after spending, a {rate} savings rate.",
            "What's the smartest thing to do with this month's surplus?",
        )

    # Budgets that mostly hold a fixed bill (rent, phone plan) are expected to run near the limit.
    fixed_categories = {item.category_name for item in d.recurring.items if item.category_name}
    for budget in d.budgets:
        name = budget.category_name
        if budget.remaining_cents < 0:
            over = f.money(f"{name} over budget", -budget.remaining_cents, "budgets")
            limit = f.money(f"{name} budget", budget.limit_cents, "budgets")
            add(
                f"over-{budget.category_id}",
                "alert",
                f"{name} is over budget",
                f"{over} past the {limit} limit.",
                f"Why is my {name} spending over budget, and what can I change?",
            )
        elif (
            budget.limit_cents
            and budget.usage_basis_points >= BUDGET_WATCH_BASIS_POINTS
            and name not in fixed_categories
        ):
            used = f.percent(f"{name} budget used", budget.usage_basis_points, "budgets")
            left = f.money(f"{name} budget left", budget.remaining_cents, "budgets")
            add(
                f"watch-{budget.category_id}",
                "watch",
                f"{name} budget is nearly used",
                f"{used} used, {left} left.",
                f"How can I make my remaining {name} budget last the month?",
            )

    for item in d.category_spending:
        name = item.category_name
        average = ctx.category_average_cents(name)
        if (
            average
            and item.spent_cents * 10_000 >= average * HOT_CATEGORY_BASIS_POINTS
            and item.spent_cents - average >= HOT_CATEGORY_MIN_EXTRA_CENTS
        ):
            spent = f.money(f"{name} spent this month", item.spent_cents, "transactions")
            usual = f.money(f"{name} 3-month average", average, "history")
            add(
                f"hot-{item.category_id}",
                "watch",
                f"{name} is running above your usual",
                f"{spent} vs a {usual} monthly average.",
                f"Where is my {name} money going this month?",
            )

    if ctx.unpaid_bills_cents:
        bills = f.money("Bills due before payday", ctx.unpaid_bills_cents, "bills")
        after_cents = ctx.account_total("chequing") - ctx.unpaid_bills_cents
        after = f.money("Chequing after bills", after_cents, "accounts")
        if after_cents < 0:
            add(
                "bills",
                "alert",
                "Upcoming bills exceed your chequing balance",
                f"{bills} is due soon and chequing would be {after} after paying it.",
                "How should I cover my upcoming bills?",
            )
        else:
            add(
                "bills",
                "positive",
                "Upcoming bills are covered",
                f"{bills} in bills is coming up; chequing keeps {after} after paying them.",
                "Am I ready for next month's bills?",
            )

    for item in d.recurring.items:
        if 0 <= item.days_until_due <= 3:
            amount = f.money(item.name, item.amount_cents, "recurring")
            when = "today" if item.days_until_due == 0 else f"in {item.days_until_due} days"
            if item.days_until_due == 1:
                when = "tomorrow"
            add(
                f"due-{item.id}",
                "watch",
                f"{item.name} is due {when}",
                f"{amount} comes out on {item.next_due.strftime('%B %-d')}.",
                f"Am I ready for my {item.name} payment?",
            )

    surplus_cents = ctx.typical_surplus_cents
    for goal in d.savings_goals:
        needed_cents = goal_monthly_needed(goal)
        if not needed_cents or goal.target_date is None:
            continue
        needed = f.money(f"Monthly saving needed for {goal.name}", needed_cents, "goals")
        target = goal.target_date.strftime("%B %Y")
        if needed_cents > surplus_cents:
            surplus = f.money("Typical monthly surplus (3-month average)", surplus_cents, "history")
            add(
                f"goal-{goal.id}",
                "watch",
                f"{goal.name} needs a bigger push",
                f"Hitting it by {target} takes {needed} a month, more than your "
                f"{surplus} typical surplus.",
                f"How can I still reach my {goal.name} on time?",
            )
        else:
            add(
                f"goal-{goal.id}",
                "positive",
                f"{goal.name} is within reach",
                f"{needed} a month gets you there by {target}.",
                f"Should I set up a monthly contribution to my {goal.name}?",
            )

    if d.credit and d.credit.utilization_basis_points > COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS:
        used = f.percent("Credit utilization", d.credit.utilization_basis_points, "accounts")
        guideline = f.percent(
            "Common utilization guideline", COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS, "education"
        )
        add(
            "credit",
            "watch",
            "Credit card use is above the common guideline",
            f"{used} of your limit is in use; many guides suggest staying under {guideline}.",
            "How much should I pay on my credit card to lower my utilization?",
        )

    order = {"alert": 0, "watch": 1, "positive": 2}
    return sorted(signals, key=lambda item: order[item.tone])

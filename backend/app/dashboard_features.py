"""Builders for the dashboard's derived features. Pure functions over plain store data."""

import calendar
from collections.abc import Iterable, Sequence
from datetime import date, timedelta

from app.dashboard_models import (
    AccountBalance,
    AccountGoal,
    AccountsOverview,
    Bill,
    FoundationCheck,
    Goal,
    LearningProgress,
    Lesson,
    MoneyCalendar,
    MoneyDay,
    MoneyStreaks,
    RecurringExpense,
    RecurringSuggestion,
    RecurringSummary,
)
from app.domain.categorize import necessity
from app.domain.finance import format_cad
from app.domain.money_days import DayInput, DayScore, daily_allowance_cents, score_days, streaks
from app.domain.recurring import RecurringSeries, detect_fixed_series, next_due, series_key
from app.learning.engine import Learner
from app.models import Account, Transaction

# ------------------------------------------------------------------ recurring expenses

_SUBSCRIPTION_WORDS = ("subscription", "streaming", "netflix", "spotify", "disney", "membership")


def monthly_equivalent_cents(amount_cents: int, frequency: str) -> int:
    """What a bill costs per month on average, floored to the cent."""
    per_year = {"weekly": 52, "biweekly": 26, "monthly": 12, "yearly": 1}[frequency]
    return amount_cents * per_year // 12


def next_due_after(due: date, frequency: str) -> date:
    if frequency == "weekly":
        return due + timedelta(days=7)
    if frequency == "biweekly":
        return due + timedelta(days=14)
    months = 12 if frequency == "yearly" else 1
    index = due.year * 12 + due.month - 1 + months
    year, month = index // 12, index % 12 + 1
    return date(year, month, min(due.day, calendar.monthrange(year, month)[1]))


def bill_due_dates(bill: Bill, start: date, end: date) -> list[date]:
    """Due dates of an unpaid bill from its next due date through `end`."""
    dates = []
    due = bill.next_due
    while due <= end:
        if due >= start:
            dates.append(due)
        due = next_due_after(due, bill.frequency)
    return dates


def build_recurring(
    bills: Sequence[Bill],
    transactions: Sequence[Transaction],
    category_names: dict[str, str],
    active_month: date,
    today: date,
    next_payday: date | None,
    typical_income_cents: int,
) -> RecurringSummary:
    items = []
    payments: dict[str, int] = {}
    for transaction in transactions:
        if transaction.bill_id:
            payments[transaction.bill_id] = payments.get(transaction.bill_id, 0) + 1
    for bill in bills:
        # Non-essential repeating charges (streaming, memberships) read as subscriptions.
        is_subscription = necessity(bill.name, bill.category_id) == "want" or any(
            word in bill.name.casefold() for word in _SUBSCRIPTION_WORDS
        )
        items.append(
            RecurringExpense(
                id=bill.id,
                name=bill.name,
                category_name=category_names.get(bill.category_id) if bill.category_id else None,
                amount_cents=bill.amount_cents,
                monthly_cents=monthly_equivalent_cents(bill.amount_cents, bill.frequency),
                frequency=bill.frequency,
                next_due=bill.next_due,
                days_until_due=(bill.next_due - today).days,
                kind="subscription" if is_subscription else "bill",
                auto_record=bill.auto_record,
                last_paid_on=bill.last_paid_on,
                payment_count=payments.get(bill.id, 0),
            )
        )
    items.sort(key=lambda item: item.next_due)
    known = {series_key(bill.name) for bill in bills}
    known_amounts = {bill.amount_cents for bill in bills}
    suggestions = [
        RecurringSuggestion(
            name=series.name,
            category_id=series.category_id,
            amount_cents=series.amount_cents,
            next_due=next_due(series, today),
        )
        for series in detect_fixed_series(transactions, active_month)
        if series.key not in known and series.amount_cents not in known_amounts
    ]
    fixed = sum(item.monthly_cents for item in items)
    subscriptions = sum(item.monthly_cents for item in items if item.kind == "subscription")
    week_end = today + timedelta(days=7)
    payday_end = (next_payday - timedelta(days=1)) if next_payday else week_end
    return RecurringSummary(
        items=items,
        suggestions=suggestions,
        fixed_monthly_cents=fixed,
        subscriptions_monthly_cents=subscriptions,
        due_next_7_days_cents=sum(
            bill.amount_cents * len(bill_due_dates(bill, today, week_end)) for bill in bills
        ),
        due_before_payday_cents=sum(
            bill.amount_cents * len(bill_due_dates(bill, today, payday_end)) for bill in bills
        ),
        share_of_income_basis_points=(
            fixed * 10_000 // typical_income_cents if typical_income_cents > 0 else None
        ),
        methodology=(
            "Your fixed monthly total adds up every scheduled bill at its monthly cost (weekly "
            "bills × 52 ÷ 12, yearly ÷ 12). Suggestions come from charges that repeated in at "
            "least 3 of the last 4 months at the same amount."
        ),
    )


# ------------------------------------------------------------------ daily money score

MONEY_SCORE_METHODOLOGY = (
    "Each day scores 0-100 from flexible spending only; fixed bills are excluded. Up to 60 points "
    "for month-to-date pace against your flexible budget (full points at or under 90% of pace), "
    "and up to 40 for the day itself (40 for a no-spend day, falling as spending passes 1x, 2x, "
    "and 3x your daily allowance). Green is 67+, yellow 34-66, red 33 or less."
)


def flexible_budget_cents(budget_total_cents: int, fixed: Sequence[RecurringSeries]) -> int:
    return max(0, budget_total_cents - sum(item.amount_cents for item in fixed))


def score_month(
    month: date,
    transactions: Sequence[Transaction],
    fixed: Sequence[RecurringSeries],
    flexible_budget: int,
    through_day: int,
) -> list[DayScore]:
    fixed_keys = {item.key for item in fixed}
    days_in_month = calendar.monthrange(month.year, month.month)[1]
    inputs = []
    for day in range(1, through_day + 1):
        on_day = [t for t in transactions if t.occurred_on == month.replace(day=day)]
        spending = [t for t in on_day if t.kind == "spending"]
        flexible = [t for t in spending if series_key(t.description) not in fixed_keys]
        inputs.append(
            DayInput(
                day=day,
                flexible_spent_cents=sum(t.amount_cents for t in flexible),
                total_spent_cents=sum(t.amount_cents for t in spending),
                income_cents=sum(t.amount_cents for t in on_day if t.kind == "income"),
            )
        )
    return score_days(inputs, flexible_budget, days_in_month)


def build_calendar(
    month: date,
    today: date | None,
    month_transactions: Sequence[Transaction],
    scores: Sequence[DayScore],
    history: Sequence[DayScore],
    flexible_budget: int,
    due_by_day: dict[date, list[str]],
) -> MoneyCalendar:
    days_in_month = calendar.monthrange(month.year, month.month)[1]
    by_day = {score.day: score for score in scores}
    days = []
    for day_number in range(1, days_in_month + 1):
        day = month.replace(day=day_number)
        score = by_day.get(day_number)
        days.append(
            MoneyDay(
                day=day,
                future=score is None,
                score=score.score if score else None,
                zone=score.zone if score else None,
                pace_points=score.pace_points if score else None,
                day_points=score.day_points if score else None,
                flexible_spent_cents=score.flexible_spent_cents if score else 0,
                total_spent_cents=score.total_spent_cents if score else 0,
                income_cents=score.income_cents if score else 0,
                transaction_count=sum(1 for t in month_transactions if t.occurred_on == day),
                due=due_by_day.get(day, []),
            )
        )
    latest = scores[-1] if scores and today else None
    summary = streaks(history, scores)
    return MoneyCalendar(
        month=month,
        today=today,
        today_score=latest.score if latest else None,
        today_zone=latest.zone if latest else None,
        flexible_budget_cents=flexible_budget,
        daily_allowance_cents=daily_allowance_cents(flexible_budget, days_in_month),
        days=days,
        streaks=MoneyStreaks(
            current_green=summary.current_green,
            best_green=summary.best_green,
            no_spend_days=summary.no_spend_days,
            green_days=summary.green_days,
            scored_days=summary.scored_days,
        ),
        methodology=MONEY_SCORE_METHODOLOGY,
    )


# ------------------------------------------------------------------ accounts

SPENDING_ACCOUNT_TYPES = ("chequing", "cash")


def build_accounts_overview(
    accounts: Sequence[Account],
    goals: Sequence[Goal],
    transactions: Iterable[Transaction],
    month: date,
    today: date,
) -> AccountsOverview:
    """Each account's balance, goal money, and this month's flow, plus the totals they add to.

    Net worth = everything in non-credit accounts − what's owed on credit cards.
    """
    flows: dict[str, list[int]] = {account.id: [0, 0] for account in accounts}
    last: dict[str, date] = {}
    for item in transactions:
        if item.account_id not in flows or item.occurred_on > today:
            continue
        if (item.occurred_on.year, item.occurred_on.month) == (month.year, month.month):
            flows[item.account_id][0 if item.kind == "income" else 1] += item.amount_cents
        if item.account_id not in last or item.occurred_on > last[item.account_id]:
            last[item.account_id] = item.occurred_on
    rows = []
    shortfall = 0
    for account in accounts:
        credit = account.account_type == "credit"
        held = [g for g in goals if g.account_id == account.id and g.current_cents > 0]
        claimed = sum(g.current_cents for g in held)
        goal_cents = 0 if credit else min(claimed, account.balance_cents)
        shortfall += 0 if credit else claimed - goal_cents
        limit = account.credit_limit_cents if credit else None
        rows.append(
            AccountBalance(
                id=account.id,
                name=account.name,
                account_type=account.account_type,
                balance_cents=account.balance_cents,
                net_cents=-account.balance_cents if credit else account.balance_cents,
                credit_limit_cents=limit,
                available_credit_cents=max(0, limit - account.balance_cents) if limit else None,
                utilization_basis_points=(
                    account.balance_cents * 10_000 // limit if limit else None
                ),
                goals=[
                    AccountGoal(id=g.id, name=g.name, current_cents=g.current_cents) for g in held
                ],
                goal_cents=goal_cents,
                free_cents=None if credit else account.balance_cents - goal_cents,
                money_in_cents=flows[account.id][0],
                money_out_cents=flows[account.id][1],
                last_activity_on=last.get(account.id),
            )
        )

    def total(*types: str) -> int:
        return sum(a.balance_cents for a in accounts if a.account_type in types)

    assets = sum(a.balance_cents for a in accounts if a.account_type != "credit")
    owed = total("credit")
    return AccountsOverview(
        accounts=rows,
        spending_cents=total(*SPENDING_ACCOUNT_TYPES),
        savings_cents=total("savings"),
        investments_cents=total("investment"),
        other_cents=total("other"),
        assets_cents=assets,
        owed_cents=owed,
        net_worth_cents=assets - owed,
        goal_cents=sum(row.goal_cents for row in rows),
        goal_shortfall_cents=shortfall,
    )


# ------------------------------------------------------------------ learning


def build_learning(learner: Learner, mission_xp: int, today: date) -> LearningProgress:
    """The dashboard's learning summary (Home's streak card), from the learning game's state."""
    state = learner.state(mission_xp, today)
    monday = today - timedelta(days=today.weekday())
    lessons = [
        Lesson(
            id=card.id,
            track=card.topic,
            difficulty=card.tier,
            title=card.title,
            xp_reward=card.xp_max,
            completed=card.passed,
        )
        for path in state.topics
        for card in path.lessons
    ]
    upcoming = learner.next_lesson()
    return LearningProgress(
        xp_total=state.xp_total,
        level=state.level,
        level_xp=state.level_xp,
        level_size_xp=state.level_size_xp,
        streak_days=state.streak_days,
        completed_today=state.completed_today,
        week_activity=[
            monday + timedelta(days=offset) in learner.activity_days for offset in range(7)
        ],
        next_lesson=next(
            (lesson for lesson in lessons if upcoming and lesson.id == upcoming.id), None
        ),
        lessons=lessons,
    )


# ------------------------------------------------------------------ investing foundations

EMERGENCY_MONTHS = 3


def build_foundations(
    savings_cents: int,
    fixed_monthly_cents: int,
    card_balance_cents: int,
    typical_surplus_cents: int,
    goals_due_within_year: int,
) -> list[FoundationCheck]:
    """Common pre-investing foundations from Canadian education material. Not advice."""
    cushion = fixed_monthly_cents * EMERGENCY_MONTHS
    checks = [
        FoundationCheck(
            id="emergency",
            title="An emergency cushion",
            status="met"
            if savings_cents >= cushion
            else "in_progress"
            if savings_cents
            else "not_met",
            detail=f"{format_cad(savings_cents)} saved vs {format_cad(cushion)}, about "
            f"{EMERGENCY_MONTHS} months of your fixed costs.",
        ),
        FoundationCheck(
            id="card",
            title="No card balance carried",
            status="met" if card_balance_cents == 0 else "not_met",
            detail=(
                "Your card is paid off."
                if card_balance_cents == 0
                else f"{format_cad(card_balance_cents)} on your card. Card interest is often "
                "around 20% a year, which is more than investments typically return."
            ),
        ),
        FoundationCheck(
            id="surplus",
            title="Money left over each month",
            status="met" if typical_surplus_cents > 0 else "not_met",
            detail=f"Your typical monthly surplus is {format_cad(typical_surplus_cents)}.",
        ),
        FoundationCheck(
            id="short-term",
            title="Short-term goals kept safe",
            status="met" if goals_due_within_year == 0 else "in_progress",
            detail=(
                "No goals are due within a year."
                if goals_due_within_year == 0
                else f"{goals_due_within_year} goal(s) are due within a year. Money needed soon "
                "usually stays in savings rather than investments."
            ),
        ),
    ]
    return checks

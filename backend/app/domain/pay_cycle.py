"""Pay cycles and the day-by-day "what's left until payday" forecast.

A pay cycle runs from one payday to the day before the next. Each day's balance is:
- for days up to today: reconstructed from the current balance and the actual transactions;
- for later days: carried forward, adding projected paydays and subtracting scheduled bills
  (and, in "budget" mode, the daily flexible allowance).

Everything is integer cents. Nothing here reads a database or calls a model.
"""

import calendar
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

Status = Literal["comfortable", "tight", "short"]
TIGHT_THRESHOLD_CENTS = 10_000

_STEP_DAYS = {"weekly": 7, "biweekly": 14}


def _last_day(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _add_months(day: date, months: int, day_of_month: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = index // 12, index % 12 + 1
    return date(year, month, min(day_of_month, _last_day(year, month)))


def paydays(
    frequency: str, anchor: date, start: date, end: date, interval_days: int | None = None
) -> list[date]:
    """Every payday in [start, end] for a schedule that includes `anchor` as a payday."""
    if start > end:
        return []
    if frequency == "semimonthly":
        days = []
        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            for day in (15, _last_day(cursor.year, cursor.month)):
                candidate = cursor.replace(day=day)
                if start <= candidate <= end:
                    days.append(candidate)
            cursor = _add_months(cursor, 1, 1)
        return days
    if frequency == "monthly":
        days = []
        offset = (start.year - anchor.year) * 12 + start.month - anchor.month - 1
        while True:
            candidate = _add_months(anchor, offset, anchor.day)
            if candidate > end:
                return days
            if candidate >= start:
                days.append(candidate)
            offset += 1
    step = _STEP_DAYS.get(frequency) or interval_days
    if not step or step <= 0:
        raise ValueError("custom schedules need a positive interval_days")
    first = anchor + timedelta(days=((start - anchor).days // step) * step)
    days = []
    cursor = first
    while cursor <= end:
        if cursor >= start:
            days.append(cursor)
        cursor += timedelta(days=step)
    return days


@dataclass(frozen=True, slots=True)
class Cycle:
    offset: int
    start: date
    end: date


def cycles_around(
    frequency: str, anchor: date, today: date, before: int, after: int, interval_days: int | None
) -> list[Cycle]:
    """Cycles from `before` cycles ago to `after` cycles ahead of the one containing today."""
    window = 400 * (before + after + 2)
    days = paydays(
        frequency,
        anchor,
        today - timedelta(days=window),
        today + timedelta(days=window),
        interval_days,
    )
    current = max(index for index, day in enumerate(days) if day <= today)
    result = []
    for offset in range(-before, after + 1):
        index = current + offset
        result.append(Cycle(offset, days[index], days[index + 1] - timedelta(days=1)))
    return result


@dataclass(frozen=True, slots=True)
class Event:
    day: date
    name: str
    amount_cents: int  # signed
    kind: str
    projected: bool


@dataclass(slots=True)
class DayBalance:
    day: date
    start_cents: int
    end_cents: int
    status: Status
    past: bool
    is_today: bool
    is_payday: bool
    events: list[Event] = field(default_factory=list)


def status_for(end_cents: int, tight_threshold_cents: int = TIGHT_THRESHOLD_CENTS) -> Status:
    if end_cents < 0:
        return "short"
    return "tight" if end_cents < tight_threshold_cents else "comfortable"


def _days(start: date, end: date) -> Iterator[date]:
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def forecast(
    cycle: Cycle,
    today: date,
    balance_today_cents: int,
    actual: Sequence[Event],
    projected: Sequence[Event],
    paydays_in_cycle: set[date],
    daily_budget_cents: int,
) -> list[DayBalance]:
    """Balances for each day of `cycle`.

    `balance_today_cents` is the spendable balance after today's recorded transactions.
    `actual` are recorded transactions; `projected` are paydays and bills not yet recorded,
    dated today or later. In budget mode, `daily_budget_cents` is subtracted for each day after
    today to stand in for everyday spending.
    """

    def end_of(day: date) -> int:
        if day < today:
            return balance_today_cents - sum(e.amount_cents for e in actual if day < e.day <= today)
        future_days = (day - today).days
        upcoming = sum(e.amount_cents for e in projected if today <= e.day <= day)
        return balance_today_cents + upcoming - daily_budget_cents * future_days

    result = []
    for day in _days(cycle.start, cycle.end):
        events = [e for e in (*actual, *projected) if e.day == day]
        if day > today and daily_budget_cents > 0:
            events.append(
                Event(day, "Everyday spending", -daily_budget_cents, "daily_budget", True)
            )
        end = end_of(day)
        result.append(
            DayBalance(
                day=day,
                start_cents=end_of(day - timedelta(days=1)),
                end_cents=end,
                status=status_for(end),
                past=day < today,
                is_today=day == today,
                is_payday=day in paydays_in_cycle,
                events=events,
            )
        )
    return result

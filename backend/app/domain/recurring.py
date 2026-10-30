"""Detect fixed recurring expenses from transaction history.

A merchant is treated as a fixed monthly expense when it was charged once a month in at
least `MIN_MONTHS_SEEN` of the last `LOOKBACK_MONTHS` months and its two latest charges are
identical. Fixed charges (rent, phone plans, passes, subscriptions) repeat to the cent; a
price change is picked up once two charges match again. Variable recurring spending, such as
groceries, is deliberately excluded: the point is the total that happens every month
regardless of choices.
"""

import calendar
import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.models import Transaction

LOOKBACK_MONTHS = 4
MIN_MONTHS_SEEN = 3


@dataclass(frozen=True, slots=True)
class RecurringSeries:
    key: str
    name: str
    category_id: str | None
    amount_cents: int
    day_of_month: int
    months_seen: int
    last_charged: date


def series_key(description: str) -> str:
    return re.sub(r"[^a-z]+", " ", description.casefold()).strip()


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def detect_fixed_series(
    transactions: Iterable[Transaction], active_month: date
) -> list[RecurringSeries]:
    newest = _month_index(active_month)
    groups: dict[str, list[Transaction]] = {}
    for item in transactions:
        age = newest - _month_index(item.occurred_on)
        if item.kind == "spending" and 0 <= age < LOOKBACK_MONTHS:
            groups.setdefault(series_key(item.description), []).append(item)
    series = []
    for key, items in groups.items():
        months = {_month_index(item.occurred_on) for item in items}
        if len(months) < MIN_MONTHS_SEEN or len(items) != len(months):
            continue
        ordered = sorted(items, key=lambda item: item.occurred_on)
        previous, latest = ordered[-2], ordered[-1]
        if previous.amount_cents != latest.amount_cents:
            continue
        series.append(
            RecurringSeries(
                key=key,
                name=latest.description,
                category_id=latest.category_id,
                amount_cents=latest.amount_cents,
                day_of_month=latest.occurred_on.day,
                months_seen=len(months),
                last_charged=latest.occurred_on,
            )
        )
    return sorted(series, key=lambda item: item.day_of_month)


def next_due(series: RecurringSeries, today: date) -> date:
    """The next expected charge on or after today, assuming the same day each month."""
    year, month = today.year, today.month
    if series.last_charged.year == year and series.last_charged.month == month:
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    day = min(series.day_of_month, calendar.monthrange(year, month)[1])
    candidate = date(year, month, day)
    if candidate < today:
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        candidate = date(year, month, min(series.day_of_month, calendar.monthrange(year, month)[1]))
    return candidate

"""Names for date ranges: "This month", "Last 6 months", "2025", or "Sep 1 – Oct 15, 2026"."""

import calendar
from dataclasses import dataclass
from datetime import date

MAX_PERIOD_MONTHS = 36


@dataclass(frozen=True, slots=True)
class PeriodName:
    label: str
    # Reads after a verb: "You've spent $X {phrase}".
    phrase: str
    months: list[date]
    single_month: bool


def month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def months_between(start: date, end: date) -> list[date]:
    months = []
    cursor = start.replace(day=1)
    while cursor <= end:
        months.append(cursor)
        cursor = date(cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1)
    return months


def _short(day: date) -> str:
    return f"{day:%b} {day.day}"


def describe_period(start: date, end: date, current_month: date) -> PeriodName:
    if start > end:
        raise ValueError("start must not be after end")
    months = months_between(start, end)
    if len(months) > MAX_PERIOD_MONTHS:
        raise ValueError(f"Periods are limited to {MAX_PERIOD_MONTHS} months")
    whole_months = start.day == 1 and end == month_end(end)
    current_end = month_end(current_month)

    if whole_months and len(months) == 1:
        if start == current_month:
            return PeriodName(f"{start:%B %Y}", "this month", months, True)
        return PeriodName(f"{start:%B %Y}", f"in {start:%B %Y}", months, True)
    if start == date(start.year, 1, 1) and end in (date(start.year, 12, 31), current_end):
        if start.year == current_month.year:
            return PeriodName("This year", "this year", months, False)
        if end == date(start.year, 12, 31):
            return PeriodName(str(start.year), f"in {start.year}", months, False)
    if whole_months and end == current_end:
        return PeriodName(
            f"Last {len(months)} months", f"in the last {len(months)} months", months, False
        )
    start_text = _short(start) + (f", {start.year}" if start.year != end.year else "")
    span = f"{start_text} – {_short(end)}, {end.year}"
    return PeriodName(span, f"from {span.replace(' – ', ' to ')}", months, False)

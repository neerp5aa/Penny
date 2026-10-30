"""Daily Money Score: a WHOOP-style 0-100 day rating with green, yellow, and red zones.

Fixed recurring costs (rent, phone, transit pass) are excluded, because they happen no
matter what the user chooses. The score rates flexible spending only:

- Pace, up to 60 points: flexible spending so far this month against the flexible budget
  pro-rated to that day. 60 points at or under 90% of pace, falling linearly to 0 at 130%.
- Day, up to 40 points: that day's flexible spending against the daily allowance
  (flexible budget / days in month). No spending earns 40; up to 1x allowance 32; up to 2x 20;
  up to 3x 8; more than 3x 0.

Zones use WHOOP's bands: green 67-100, yellow 34-66, red 0-33. All arithmetic is integer.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

Zone = Literal["green", "yellow", "red"]

PACE_POINTS = 60
DAY_POINTS = 40
PACE_FULL_BASIS_POINTS = 9_000
PACE_ZERO_BASIS_POINTS = 13_000
GREEN_MIN = 67
YELLOW_MIN = 34


@dataclass(frozen=True, slots=True)
class DayInput:
    day: int
    flexible_spent_cents: int
    total_spent_cents: int
    income_cents: int


@dataclass(frozen=True, slots=True)
class DayScore:
    day: int
    score: int
    zone: Zone
    pace_points: int
    day_points: int
    flexible_spent_cents: int
    total_spent_cents: int
    income_cents: int
    month_to_date_flexible_cents: int


def zone_for(score: int) -> Zone:
    if score >= GREEN_MIN:
        return "green"
    return "yellow" if score >= YELLOW_MIN else "red"


def daily_allowance_cents(flexible_budget_cents: int, days_in_month: int) -> int:
    if days_in_month <= 0:
        raise ValueError("days_in_month must be positive")
    return max(1, max(0, flexible_budget_cents) // days_in_month)


def pace_points(
    month_to_date_cents: int, flexible_budget_cents: int, day: int, days_in_month: int
) -> int:
    budget = max(1, flexible_budget_cents)
    ratio = month_to_date_cents * 10_000 * days_in_month // (budget * day)
    if ratio <= PACE_FULL_BASIS_POINTS:
        return PACE_POINTS
    if ratio >= PACE_ZERO_BASIS_POINTS:
        return 0
    span = PACE_ZERO_BASIS_POINTS - PACE_FULL_BASIS_POINTS
    return PACE_POINTS * (PACE_ZERO_BASIS_POINTS - ratio) // span


def day_points(spent_cents: int, allowance_cents: int) -> int:
    if spent_cents <= 0:
        return DAY_POINTS
    for multiple, points in ((1, 32), (2, 20), (3, 8)):
        if spent_cents <= allowance_cents * multiple:
            return points
    return 0


def score_days(
    days: Sequence[DayInput], flexible_budget_cents: int, days_in_month: int
) -> list[DayScore]:
    """Scores days in order; `days` must be consecutive from day 1."""
    allowance = daily_allowance_cents(flexible_budget_cents, days_in_month)
    running = 0
    scored = []
    for item in days:
        if item.flexible_spent_cents < 0:
            raise ValueError("spending cannot be negative")
        running += item.flexible_spent_cents
        pace = pace_points(running, flexible_budget_cents, item.day, days_in_month)
        today = day_points(item.flexible_spent_cents, allowance)
        score = pace + today
        scored.append(
            DayScore(
                day=item.day,
                score=score,
                zone=zone_for(score),
                pace_points=pace,
                day_points=today,
                flexible_spent_cents=item.flexible_spent_cents,
                total_spent_cents=item.total_spent_cents,
                income_cents=item.income_cents,
                month_to_date_flexible_cents=running,
            )
        )
    return scored


@dataclass(frozen=True, slots=True)
class Streaks:
    current_green: int
    best_green: int
    no_spend_days: int
    green_days: int
    scored_days: int


def streaks(history: Sequence[DayScore], this_month: Sequence[DayScore]) -> Streaks:
    """`history` is every scored day oldest-first, ending today; `this_month` is its tail."""
    current = best = run = 0
    for item in history:
        run = run + 1 if item.zone == "green" else 0
        best = max(best, run)
    for item in reversed(history):
        if item.zone != "green":
            break
        current += 1
    return Streaks(
        current_green=current,
        best_green=best,
        no_spend_days=sum(1 for item in this_month if item.flexible_spent_cents == 0),
        green_days=sum(1 for item in this_month if item.zone == "green"),
        scored_days=len(this_month),
    )

"""Pure integer-cent calculations behind every number the coach quotes."""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.domain.finance import BASIS_POINTS, COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS


def ceil_div(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    return -(-numerator // denominator)


def add_months(month: date, count: int) -> date:
    index = month.year * 12 + month.month - 1 + count
    return date(index // 12, index % 12 + 1, 1)


def months_until(from_month: date, target: date) -> int:
    """Monthly contributions left before `target`, counting the target's own month."""
    return max(1, (target.year - from_month.year) * 12 + target.month - from_month.month)


@dataclass(frozen=True, slots=True)
class Affordability:
    price_cents: int
    chequing_after_bills_cents: int
    chequing_after_purchase_cents: int
    total_cash_after_purchase_cents: int
    budget_remaining_after_cents: int
    months_of_surplus: int | None
    verdict: Literal["fits_now", "stretch", "not_yet"]


def affordability(
    price_cents: int,
    chequing_cents: int,
    savings_cents: int,
    unpaid_bills_cents: int,
    budget_remaining_cents: int,
    monthly_surplus_cents: int,
) -> Affordability:
    """Bills are reserved first. "Stretch" means it only works by dipping into savings or
    going over this month's budget."""
    if price_cents <= 0:
        raise ValueError("price must be positive")
    chequing_after_bills = chequing_cents - unpaid_bills_cents
    chequing_after = chequing_after_bills - price_cents
    total_after = chequing_after + savings_cents
    budget_after = budget_remaining_cents - price_cents
    if chequing_after >= 0 and budget_after >= 0:
        verdict: Literal["fits_now", "stretch", "not_yet"] = "fits_now"
    elif total_after >= 0:
        verdict = "stretch"
    else:
        verdict = "not_yet"
    return Affordability(
        price_cents=price_cents,
        chequing_after_bills_cents=chequing_after_bills,
        chequing_after_purchase_cents=chequing_after,
        total_cash_after_purchase_cents=total_after,
        budget_remaining_after_cents=budget_after,
        months_of_surplus=(
            ceil_div(price_cents, monthly_surplus_cents) if monthly_surplus_cents > 0 else None
        ),
        verdict=verdict,
    )


@dataclass(frozen=True, slots=True)
class SavingsPlan:
    remaining_cents: int
    months: int
    monthly_cents: int
    surplus_left_cents: int
    feasible: bool


def savings_plan(
    target_cents: int, already_saved_cents: int, months: int, monthly_surplus_cents: int
) -> SavingsPlan:
    if target_cents <= 0 or months <= 0:
        raise ValueError("target and months must be positive")
    remaining = max(0, target_cents - already_saved_cents)
    monthly = ceil_div(remaining, months)
    return SavingsPlan(
        remaining_cents=remaining,
        months=months,
        monthly_cents=monthly,
        surplus_left_cents=monthly_surplus_cents - monthly,
        feasible=monthly <= monthly_surplus_cents,
    )


@dataclass(frozen=True, slots=True)
class PaymentComparison:
    plan_total_cents: int
    extra_cost_cents: int
    surplus_after_payment_cents: int
    payment_share_of_surplus_basis_points: int | None
    fits_surplus: bool


def compare_payments(
    price_cents: int,
    monthly_payment_cents: int,
    payment_count: int,
    upfront_fee_cents: int,
    monthly_surplus_cents: int,
) -> PaymentComparison:
    if price_cents <= 0 or monthly_payment_cents <= 0 or payment_count <= 0:
        raise ValueError("price, payment, and payment count must be positive")
    if upfront_fee_cents < 0:
        raise ValueError("upfront fee cannot be negative")
    total = upfront_fee_cents + monthly_payment_cents * payment_count
    return PaymentComparison(
        plan_total_cents=total,
        extra_cost_cents=total - price_cents,
        surplus_after_payment_cents=monthly_surplus_cents - monthly_payment_cents,
        payment_share_of_surplus_basis_points=(
            monthly_payment_cents * BASIS_POINTS // monthly_surplus_cents
            if monthly_surplus_cents > 0
            else None
        ),
        fits_surplus=monthly_payment_cents <= monthly_surplus_cents,
    )


@dataclass(frozen=True, slots=True)
class GoalProjection:
    remaining_cents: int
    months_needed: int
    finish_month: date
    needed_for_target_date_cents: int | None
    on_track: bool | None


def project_goal(
    target_cents: int,
    current_cents: int,
    monthly_cents: int,
    from_month: date,
    target_date: date | None,
) -> GoalProjection:
    if monthly_cents <= 0:
        raise ValueError("monthly contribution must be positive")
    remaining = max(0, target_cents - current_cents)
    months_needed = ceil_div(remaining, monthly_cents)
    finish = add_months(from_month, months_needed)
    if target_date is None:
        return GoalProjection(remaining, months_needed, finish, None, None)
    return GoalProjection(
        remaining_cents=remaining,
        months_needed=months_needed,
        finish_month=finish,
        needed_for_target_date_cents=ceil_div(remaining, months_until(from_month, target_date)),
        on_track=finish <= target_date.replace(day=1),
    )


@dataclass(frozen=True, slots=True)
class SpendingCut:
    monthly_cut_cents: int
    yearly_savings_cents: int
    surplus_after_cents: int
    goal_months_before: int | None
    goal_months_after: int | None


def spending_cut(
    monthly_cut_cents: int, monthly_surplus_cents: int, goal_remaining_cents: int | None
) -> SpendingCut:
    """Goal timings assume the whole monthly surplus goes to that goal."""
    if monthly_cut_cents <= 0:
        raise ValueError("cut must be positive")
    after = monthly_surplus_cents + monthly_cut_cents
    before_months = after_months = None
    if goal_remaining_cents is not None:
        if monthly_surplus_cents > 0:
            before_months = ceil_div(goal_remaining_cents, monthly_surplus_cents)
        after_months = ceil_div(goal_remaining_cents, after) if after > 0 else None
    return SpendingCut(
        monthly_cut_cents, monthly_cut_cents * 12, after, before_months, after_months
    )


@dataclass(frozen=True, slots=True)
class CreditPayment:
    balance_after_cents: int
    utilization_before_basis_points: int
    utilization_after_basis_points: int
    within_guideline_after: bool


def credit_payment(balance_cents: int, limit_cents: int, payment_cents: int) -> CreditPayment:
    if limit_cents <= 0 or payment_cents <= 0:
        raise ValueError("limit and payment must be positive")
    after = max(0, balance_cents - payment_cents)
    after_bp = after * BASIS_POINTS // limit_cents
    return CreditPayment(
        balance_after_cents=after,
        utilization_before_basis_points=balance_cents * BASIS_POINTS // limit_cents,
        utilization_after_basis_points=after_bp,
        within_guideline_after=after_bp <= COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS,
    )

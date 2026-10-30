from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum


class TransactionKind(StrEnum):
    INCOME = "income"
    SPENDING = "spending"


@dataclass(frozen=True, slots=True)
class TransactionAmount:
    amount_cents: int
    kind: TransactionKind

    def __post_init__(self) -> None:
        _require_non_negative_cents(self.amount_cents, "amount_cents")


@dataclass(frozen=True, slots=True)
class FinancialSummary:
    income_cents: int
    spending_cents: int
    cash_flow_cents: int
    budget_remaining_cents: int
    savings_contributions_cents: int


def _require_non_negative_cents(value: int, field: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{field} must be an integer number of cents")
    if value < 0:
        raise ValueError(f"{field} must not be negative")


def income_total(transactions: Iterable[TransactionAmount]) -> int:
    return sum(
        transaction.amount_cents
        for transaction in transactions
        if transaction.kind is TransactionKind.INCOME
    )


def spending_total(transactions: Iterable[TransactionAmount]) -> int:
    return sum(
        transaction.amount_cents
        for transaction in transactions
        if transaction.kind is TransactionKind.SPENDING
    )


def budget_remaining(budget_cents: int, spent_cents: int) -> int:
    _require_non_negative_cents(budget_cents, "budget_cents")
    _require_non_negative_cents(spent_cents, "spent_cents")
    return budget_cents - spent_cents


def savings_contribution_total(contributions_cents: Iterable[int]) -> int:
    contributions = tuple(contributions_cents)
    for contribution in contributions:
        _require_non_negative_cents(contribution, "contribution_cents")
    return sum(contributions)


def build_summary(
    transactions: Iterable[TransactionAmount],
    budget_cents: int,
    contributions_cents: Iterable[int],
) -> FinancialSummary:
    materialized_transactions = tuple(transactions)
    income = income_total(materialized_transactions)
    spending = spending_total(materialized_transactions)
    contributions = savings_contribution_total(contributions_cents)
    return FinancialSummary(
        income_cents=income,
        spending_cents=spending,
        cash_flow_cents=income - spending,
        budget_remaining_cents=budget_remaining(budget_cents, spending),
        savings_contributions_cents=contributions,
    )


BASIS_POINTS = 10_000
# Educational guideline often cited in Canadian credit-literacy material; not a score rule.
COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS = 3_000


def share_basis_points(part_cents: int, whole_cents: int) -> int:
    """Floor of part / whole in basis points; 0 when the whole is 0."""
    _require_non_negative_cents(part_cents, "part_cents")
    _require_non_negative_cents(whole_cents, "whole_cents")
    return part_cents * BASIS_POINTS // whole_cents if whole_cents else 0


def credit_utilization_basis_points(balance_cents: int, credit_limit_cents: int) -> int:
    """Floor of balance / limit in basis points. The limit must be positive."""
    _require_non_negative_cents(balance_cents, "balance_cents")
    _require_non_negative_cents(credit_limit_cents, "credit_limit_cents")
    if credit_limit_cents == 0:
        raise ValueError("credit_limit_cents must be positive")
    return balance_cents * BASIS_POINTS // credit_limit_cents


def average_cents(total_cents: int, count: int) -> int:
    """Floor average of a non-negative total over a positive count; 0 for no items."""
    _require_non_negative_cents(total_cents, "total_cents")
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise ValueError("count must be a non-negative integer")
    return total_cents // count if count else 0

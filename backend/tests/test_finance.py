import pytest

from app.domain.finance import (
    TransactionAmount,
    TransactionKind,
    budget_remaining,
    build_summary,
    income_total,
    savings_contribution_total,
    spending_total,
)


def test_income_and_spending_are_summed_by_kind() -> None:
    transactions = [
        TransactionAmount(125_000, TransactionKind.INCOME),
        TransactionAmount(80_000, TransactionKind.SPENDING),
        TransactionAmount(5_250, TransactionKind.SPENDING),
    ]
    assert income_total(transactions) == 125_000
    assert spending_total(transactions) == 85_250


def test_budget_remaining_can_show_overspending() -> None:
    assert budget_remaining(10_000, 12_500) == -2_500


def test_savings_contributions_are_exact() -> None:
    assert savings_contribution_total([10_001, 2_002, 3]) == 12_006


def test_summary_handles_empty_values() -> None:
    assert build_summary([], 0, []).cash_flow_cents == 0


def test_large_integer_values_remain_exact() -> None:
    large = 10**24
    assert income_total([TransactionAmount(large, TransactionKind.INCOME)]) == large


@pytest.mark.parametrize("value", [-1, True, 1.25, "100"])
def test_invalid_money_values_are_rejected(value: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        TransactionAmount(value, TransactionKind.INCOME)  # type: ignore[arg-type]


def test_negative_contribution_is_rejected() -> None:
    with pytest.raises(ValueError):
        savings_contribution_total([1_000, -1])

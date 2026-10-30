from datetime import date

from app.auth import DEMO_USER_ID
from app.dashboard_models import (
    BudgetPatch,
    BudgetWrite,
    GoalPatch,
    GoalWrite,
    TransactionPatch,
    TransactionWrite,
)
from app.dashboard_store import DashboardStore


def test_transaction_crud_recalculates_totals_balance_and_category() -> None:
    store = DashboardStore()
    before = store.dashboard_for_user(DEMO_USER_ID)

    created = store.create_transaction(
        DEMO_USER_ID,
        TransactionWrite(
            description="Fictional pharmacy purchase",
            account_id="acct-chequing",
            category_id="cat-health",
            amount_cents=1_237,
            kind="spending",
            occurred_on=date(2026, 10, 29),
        ),
    )
    transaction = next(
        item for item in created.transactions if item.description == "Fictional pharmacy purchase"
    )
    assert created.totals.spending_cents == before.totals.spending_cents + 1_237
    assert created.totals.available_balance_cents == before.totals.available_balance_cents - 1_237
    assert (
        next(
            item for item in created.category_spending if item.category_id == "cat-health"
        ).spent_cents
        == 1_237
    )

    reassigned = store.update_transaction(
        DEMO_USER_ID,
        transaction.id,
        TransactionPatch(category_id="cat-food", amount_cents=2_000),
    )
    assert not any(item.category_id == "cat-health" for item in reassigned.category_spending)
    assert (
        next(
            item for item in reassigned.category_spending if item.category_id == "cat-food"
        ).spent_cents
        == 27_817
    )
    assert reassigned.totals.spending_cents == before.totals.spending_cents + 2_000

    deleted = store.delete_transaction(DEMO_USER_ID, transaction.id)
    assert deleted.totals == before.totals


def test_monthly_budget_crud_updates_authoritative_remaining_total() -> None:
    store = DashboardStore()
    before = store.dashboard_for_user(DEMO_USER_ID)
    created = store.create_budget(
        DEMO_USER_ID,
        BudgetWrite(
            category_id="cat-health",
            month_start=date(2026, 10, 1),
            limit_cents=10_000,
        ),
    )
    budget = next(item for item in created.budgets if item.category_id == "cat-health")
    assert created.totals.total_budget_cents == before.totals.total_budget_cents + 10_000
    assert created.totals.budget_remaining_cents == before.totals.budget_remaining_cents + 10_000

    updated = store.update_budget(DEMO_USER_ID, budget.id, BudgetPatch(limit_cents=12_345))
    assert next(item for item in updated.budgets if item.id == budget.id).limit_cents == 12_345

    deleted = store.delete_budget(DEMO_USER_ID, budget.id)
    assert deleted.totals.total_budget_cents == before.totals.total_budget_cents


def test_savings_goal_crud_recalculates_progress() -> None:
    store = DashboardStore()
    created = store.create_goal(
        DEMO_USER_ID,
        GoalWrite(
            name="Fictional laptop fund",
            target_cents=100_000,
            current_cents=25_000,
            target_date=date(2027, 3, 1),
        ),
    )
    goal = next(item for item in created.savings_goals if item.name == "Fictional laptop fund")
    assert goal.progress_basis_points == 2_500

    updated = store.update_goal(DEMO_USER_ID, goal.id, GoalPatch(current_cents=40_001))
    assert (
        next(item for item in updated.savings_goals if item.id == goal.id).progress_basis_points
        == 4_000
    )

    deleted = store.delete_goal(DEMO_USER_ID, goal.id)
    assert not any(item.id == goal.id for item in deleted.savings_goals)

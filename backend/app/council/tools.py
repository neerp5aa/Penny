from app.council.models import (
    AffordabilityResult,
    BudgetChangeResult,
    BudgetSummaryResult,
    SavingsPlanResult,
    VerificationResult,
)
from app.dashboard_models import DashboardResponse, Goal


def get_budget_summary(context: DashboardResponse) -> BudgetSummaryResult:
    return BudgetSummaryResult(
        available_balance_cents=context.totals.available_balance_cents,
        income_cents=context.totals.income_cents,
        spending_cents=context.totals.spending_cents,
        cash_flow_cents=context.totals.cash_flow_cents,
        total_budget_cents=context.totals.total_budget_cents,
        budget_remaining_cents=context.totals.budget_remaining_cents,
        active_savings_cents=sum(
            goal.current_cents for goal in context.savings_goals if goal.status == "active"
        ),
    )


def calculate_affordability(
    summary: BudgetSummaryResult, purchase_cents: int
) -> AffordabilityResult:
    if purchase_cents <= 0:
        raise ValueError("purchase_cents must be positive")
    return AffordabilityResult(
        purchase_cents=purchase_cents,
        available_after_purchase_cents=summary.available_balance_cents - purchase_cents,
        monthly_cash_flow_after_purchase_cents=summary.cash_flow_cents - purchase_cents,
        can_pay_from_available_cash=summary.available_balance_cents >= purchase_cents,
        covered_by_monthly_cash_flow=summary.cash_flow_cents >= purchase_cents,
    )


def simulate_budget_change(
    summary: BudgetSummaryResult, added_spending_cents: int
) -> BudgetChangeResult:
    if added_spending_cents <= 0:
        raise ValueError("added_spending_cents must be positive")
    return BudgetChangeResult(
        spending_after_cents=summary.spending_cents + added_spending_cents,
        budget_remaining_after_cents=summary.budget_remaining_cents - added_spending_cents,
        cash_flow_after_cents=summary.cash_flow_cents - added_spending_cents,
    )


def calculate_savings_plan(
    summary: BudgetSummaryResult,
    purchase_cents: int,
    horizon_months: int,
    goal: Goal | None,
) -> SavingsPlanResult:
    if purchase_cents <= 0 or horizon_months <= 0:
        raise ValueError("purchase and horizon must be positive")
    saved = min(goal.current_cents, purchase_cents) if goal else 0
    remaining = purchase_cents - saved
    monthly = (remaining + horizon_months - 1) // horizon_months
    return SavingsPlanResult(
        goal_id=goal.id if goal else None,
        purchase_cents=purchase_cents,
        saved_for_purchase_cents=saved,
        remaining_to_save_cents=remaining,
        horizon_months=horizon_months,
        monthly_contribution_cents=monthly,
        cash_flow_after_contribution_cents=summary.cash_flow_cents - monthly,
        feasible_from_current_cash_flow=summary.cash_flow_cents >= monthly,
    )


def verify_financial_plan(
    summary: BudgetSummaryResult,
    affordability: AffordabilityResult,
    budget_change: BudgetChangeResult,
    savings_plan: SavingsPlanResult,
) -> VerificationResult:
    checks = []
    issues = []

    expected_available = summary.available_balance_cents - affordability.purchase_cents
    if affordability.available_after_purchase_cents == expected_available:
        checks.append("available balance after purchase recomputed")
    else:
        issues.append("available balance after purchase does not match")

    expected_spending = summary.spending_cents + affordability.purchase_cents
    if budget_change.spending_after_cents == expected_spending:
        checks.append("spending scenario recomputed")
    else:
        issues.append("spending scenario does not match")

    expected_monthly = (
        savings_plan.remaining_to_save_cents + savings_plan.horizon_months - 1
    ) // savings_plan.horizon_months
    if savings_plan.monthly_contribution_cents == expected_monthly:
        checks.append("savings contribution recomputed with integer ceiling")
    else:
        issues.append("savings contribution does not match")

    if (
        savings_plan.cash_flow_after_contribution_cents
        == summary.cash_flow_cents - savings_plan.monthly_contribution_cents
    ):
        checks.append("cash flow after contribution recomputed")
    else:
        issues.append("cash flow after contribution does not match")

    return VerificationResult(verified=not issues, checks=checks, issues=issues)

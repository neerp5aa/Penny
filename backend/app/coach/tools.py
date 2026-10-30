"""Tools the model may call. Each one runs deterministic code and returns formatted figures.

Amounts arrive as the CAD text the user typed ("1,299.99") and are parsed here, so the
model never converts or calculates money itself.
"""

import json
from collections.abc import Callable
from typing import Any

from app.coach import calculations as calc
from app.coach.context import CoachContext
from app.coach.facts import parse_cad
from app.coach.models import Proposal, ToolUse
from app.coach.proposals import proposal_store
from app.domain.finance import add_months

MAX_PLAN_MONTHS = 36


class ToolError(ValueError):
    """An input problem the model should explain or correct."""


def _amount(value: str, field: str) -> int:
    try:
        cents = parse_cad(value)
    except ValueError as error:
        raise ToolError(f"{field} must be a CAD amount like 1299.99") from error
    if cents <= 0:
        raise ToolError(f"{field} must be greater than zero")
    return cents


def _goal(ctx: CoachContext, goal_id: str):
    goal = ctx.find_goal(goal_id)
    if not goal:
        raise ToolError(
            f"No savings goal matches '{goal_id}'. Known ids: "
            + ", ".join(g.id for g in ctx.dashboard.savings_goals)
        )
    return goal


def check_affordability(ctx: CoachContext, item: str, price: str) -> dict[str, Any]:
    f = ctx.facts
    price_cents = _amount(price, "price")
    result = calc.affordability(
        price_cents=price_cents,
        chequing_cents=ctx.account_total("chequing"),
        savings_cents=ctx.account_total("savings"),
        unpaid_bills_cents=ctx.unpaid_bills_cents,
        budget_remaining_cents=ctx.dashboard.totals.budget_remaining_cents,
        monthly_surplus_cents=ctx.typical_surplus_cents,
    )
    ctx.tools_used.append(ToolUse(name="check_affordability", label=f"Checked if {item} fits"))
    return {
        "item": item,
        "price": f.money(f"{item} price", price_cents, "check_affordability"),
        "verdict": result.verdict,
        "verdict_meaning": {
            "fits_now": "Covered by chequing after bills and within this month's budget.",
            "stretch": "Only possible by dipping into savings or going over budget.",
            "not_yet": "Not covered even using savings after reserving bills.",
        }[result.verdict],
        "chequing_after_bills": f.money(
            "Chequing after bills", result.chequing_after_bills_cents, "check_affordability"
        ),
        "chequing_after_bills_and_purchase": f.money(
            f"Chequing after bills and {item}",
            result.chequing_after_purchase_cents,
            "check_affordability",
        ),
        "all_cash_after_bills_and_purchase": f.money(
            f"All cash after bills and {item}",
            result.total_cash_after_purchase_cents,
            "check_affordability",
        ),
        "budget_left_after_purchase": f.money(
            f"Budget left after {item}", result.budget_remaining_after_cents, "check_affordability"
        ),
        "months_of_typical_surplus_it_costs": result.months_of_surplus,
    }


def plan_savings(
    ctx: CoachContext, item: str, price: str, months: int, goal_id: str | None
) -> dict[str, Any]:
    f = ctx.facts
    if not 1 <= months <= MAX_PLAN_MONTHS:
        raise ToolError(f"months must be between 1 and {MAX_PLAN_MONTHS}")
    price_cents = _amount(price, "price")
    goal = _goal(ctx, goal_id) if goal_id else None
    saved = goal.current_cents if goal else 0
    plan = calc.savings_plan(price_cents, saved, months, ctx.typical_surplus_cents)
    ctx.tools_used.append(ToolUse(name="plan_savings", label=f"Built a {months}-month plan"))
    return {
        "item": item,
        "price": f.money(f"{item} price", price_cents, "plan_savings"),
        "already_saved_in_goal": f.money(f"Saved toward {item}", saved, "plan_savings"),
        "still_to_save": f.money(f"Still to save for {item}", plan.remaining_cents, "plan_savings"),
        "months": months,
        "monthly_saving": f.money(f"Monthly saving for {item}", plan.monthly_cents, "plan_savings"),
        "typical_surplus_left_after_saving": f.money(
            "Surplus left after saving", plan.surplus_left_cents, "plan_savings"
        ),
        "fits_typical_surplus": plan.feasible,
    }


def compare_payment_options(
    ctx: CoachContext,
    item: str,
    price: str,
    monthly_payment: str,
    payment_count: int,
    upfront_fee: str,
) -> dict[str, Any]:
    f = ctx.facts
    if not 1 <= payment_count <= 60:
        raise ToolError("payment_count must be between 1 and 60")
    price_cents = _amount(price, "price")
    monthly_cents = _amount(monthly_payment, "monthly_payment")
    fee_cents = 0 if upfront_fee.strip() in ("", "0", "0.00") else _amount(upfront_fee, "fee")
    result = calc.compare_payments(
        price_cents, monthly_cents, payment_count, fee_cents, ctx.typical_surplus_cents
    )
    ctx.tools_used.append(
        ToolUse(name="compare_payment_options", label="Compared paying upfront vs monthly")
    )
    share = result.payment_share_of_surplus_basis_points
    return {
        "item": item,
        "upfront_price": f.money(f"{item} upfront price", price_cents, "compare_payment_options"),
        "monthly_payment": f.money(
            f"{item} monthly payment", monthly_cents, "compare_payment_options"
        ),
        "payment_count": payment_count,
        "upfront_fee": f.money(f"{item} upfront fee", fee_cents, "compare_payment_options"),
        "monthly_plan_total": f.money(
            f"{item} monthly plan total", result.plan_total_cents, "compare_payment_options"
        ),
        "monthly_plan_extra_cost": f.money(
            "Extra cost of paying monthly", result.extra_cost_cents, "compare_payment_options"
        ),
        "typical_surplus_after_payment": f.money(
            "Surplus left after the monthly payment",
            result.surplus_after_payment_cents,
            "compare_payment_options",
        ),
        "payment_share_of_typical_surplus": (
            f.percent("Payment share of surplus", share, "compare_payment_options")
            if share is not None
            else None
        ),
        "monthly_payment_fits_typical_surplus": result.fits_surplus,
        "upfront_check": check_affordability(ctx, item, price),
    }


def project_goal(ctx: CoachContext, goal_id: str, monthly_contribution: str) -> dict[str, Any]:
    f = ctx.facts
    goal = _goal(ctx, goal_id)
    monthly = _amount(monthly_contribution, "monthly_contribution")
    result = calc.project_goal(
        goal.target_cents, goal.current_cents, monthly, ctx.month, goal.target_date
    )
    ctx.tools_used.append(ToolUse(name="project_goal", label=f"Projected {goal.name}"))
    return {
        "goal": goal.name,
        "monthly_contribution": f.money(
            f"Monthly contribution to {goal.name}", monthly, "project_goal"
        ),
        "still_needed": f.money(
            f"{goal.name} still needed", result.remaining_cents, "project_goal"
        ),
        "months_needed": result.months_needed,
        "projected_finish_month": result.finish_month.strftime("%B %Y"),
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "on_track_for_target_date": result.on_track,
        "monthly_needed_for_target_date": (
            f.money(
                f"Monthly saving needed for {goal.name}",
                result.needed_for_target_date_cents,
                "project_goal",
            )
            if result.needed_for_target_date_cents is not None
            else None
        ),
    }


def simulate_spending_cut(
    ctx: CoachContext, category: str, monthly_cut: str, goal_id: str | None
) -> dict[str, Any]:
    f = ctx.facts
    cut = _amount(monthly_cut, "monthly_cut")
    spent = next(
        (
            c.spent_cents
            for c in ctx.dashboard.category_spending
            if c.category_name.casefold() == category.strip().casefold()
        ),
        None,
    )
    if spent is None:
        raise ToolError(f"No spending recorded in '{category}' this month")
    goal = _goal(ctx, goal_id) if goal_id else None
    remaining = max(0, goal.target_cents - goal.current_cents) if goal else None
    result = calc.spending_cut(cut, ctx.typical_surplus_cents, remaining)
    ctx.tools_used.append(
        ToolUse(name="simulate_spending_cut", label=f"Simulated a {category} cut")
    )
    return {
        "category": category,
        "spent_this_month": f.money(f"{category} spent this month", spent, "simulate_spending_cut"),
        "monthly_cut": f.money(f"Monthly {category} cut", cut, "simulate_spending_cut"),
        "yearly_savings": f.money(
            f"Yearly savings from {category} cut",
            result.yearly_savings_cents,
            "simulate_spending_cut",
        ),
        "typical_surplus_after_cut": f.money(
            "Surplus after the cut", result.surplus_after_cents, "simulate_spending_cut"
        ),
        "goal": goal.name if goal else None,
        "goal_months_at_current_surplus": result.goal_months_before,
        "goal_months_after_cut": result.goal_months_after,
        "note": "Goal months assume the whole monthly surplus goes to that goal.",
    }


def credit_card_payment(ctx: CoachContext, payment: str) -> dict[str, Any]:
    f = ctx.facts
    credit = ctx.dashboard.credit
    if not credit:
        raise ToolError("There is no credit card on this profile")
    payment_cents = _amount(payment, "payment")
    result = calc.credit_payment(credit.balance_cents, credit.credit_limit_cents, payment_cents)
    ctx.tools_used.append(ToolUse(name="credit_card_payment", label="Modelled a card payment"))
    return {
        "payment": f.money("Card payment", payment_cents, "credit_card_payment"),
        "balance_after": f.money(
            "Card balance after payment", result.balance_after_cents, "credit_card_payment"
        ),
        "utilization_before": f.percent(
            "Credit utilization", result.utilization_before_basis_points, "credit_card_payment"
        ),
        "utilization_after": f.percent(
            "Utilization after payment",
            result.utilization_after_basis_points,
            "credit_card_payment",
        ),
        "within_common_guideline_after": result.within_guideline_after,
        "note": "Educational only; this does not predict a credit score.",
    }


def category_names(ctx: CoachContext, category_id: str | None) -> set[str]:
    """A transaction's category name plus its parent's, so "Food" finds "Groceries" too."""
    by_id = {c.id: c for c in ctx.dashboard.categories}
    category = by_id.get(category_id) if category_id else None
    if not category:
        return {"uncategorized"}
    parent = by_id.get(category.parent_id) if category.parent_id else None
    return {category.name.casefold(), *([parent.name.casefold()] if parent else [])}


def list_transactions(ctx: CoachContext, category: str | None, months_back: int) -> dict[str, Any]:
    if not 0 <= months_back <= 3:
        raise ToolError("months_back must be between 0 and 3")
    rows = []
    for offset in range(months_back + 1):
        month = add_months(ctx.month, -offset)
        snapshot = (
            ctx.dashboard if offset == 0 else ctx.store.dashboard_for_user(ctx.user_id, month)
        )
        for t in snapshot.transactions:
            if category and category.strip().casefold() not in category_names(ctx, t.category_id):
                continue
            rows.append(
                {
                    "date": t.occurred_on.isoformat(),
                    "description": t.description,
                    "category": t.category,
                    "kind": t.kind,
                    "amount": ctx.facts.money(t.description, t.amount_cents, "transactions"),
                }
            )
    ctx.tools_used.append(
        ToolUse(name="list_transactions", label=f"Reviewed {category or 'all'} transactions")
    )
    return {"category": category, "months_back": months_back, "transactions": rows[:40]}


def propose_goal_contribution(
    ctx: CoachContext, goal_id: str, amount: str, reason: str
) -> dict[str, Any]:
    f = ctx.facts
    goal = _goal(ctx, goal_id)
    amount_cents = _amount(amount, "amount")
    remaining = goal.target_cents - goal.current_cents
    if goal.status != "active" or remaining <= 0:
        raise ToolError(f"{goal.name} is not an active goal with money left to save")
    if amount_cents > remaining:
        still_needed = f.money(f"{goal.name} still needed", remaining, "goals")
        raise ToolError(f"That is more than the {still_needed} still needed")
    if amount_cents > ctx.account_total("chequing") - ctx.unpaid_bills_cents:
        raise ToolError("That would use money reserved for upcoming bills")
    proposed = goal.current_cents + amount_cents
    stored = proposal_store.create(
        ctx.user_id, "goal_contribution", goal.id, goal.current_cents, proposed
    )
    contribution = f.money(f"Proposed contribution to {goal.name}", amount_cents, "proposal")
    f.money(f"{goal.name} after contribution", proposed, "proposal")
    ctx.proposal = Proposal(
        id=stored.id,
        version=stored.version,
        kind="goal_contribution",
        title=f"Add {contribution} to {goal.name}",
        reason=reason[:300],
        target_id=goal.id,
        target_name=goal.name,
        current_cents=goal.current_cents,
        proposed_cents=proposed,
    )
    ctx.tools_used.append(ToolUse(name="propose_goal_contribution", label="Prepared a goal change"))
    return {"status": "awaiting_user_approval", "title": ctx.proposal.title}


def propose_budget_limit(
    ctx: CoachContext, category: str, new_limit: str, reason: str
) -> dict[str, Any]:
    budget = ctx.find_budget(category)
    if not budget:
        raise ToolError(f"There is no {category} budget this month")
    limit_cents = _amount(new_limit, "new_limit")
    if limit_cents == budget.limit_cents:
        raise ToolError("That is already the current limit")
    stored = proposal_store.create(
        ctx.user_id, "budget_limit", budget.id, budget.limit_cents, limit_cents
    )
    name = budget.category_name
    limit = ctx.facts.money(f"Proposed {name} budget", limit_cents, "proposal")
    ctx.proposal = Proposal(
        id=stored.id,
        version=stored.version,
        kind="budget_limit",
        title=f"Set your {name} budget to {limit}",
        reason=reason[:300],
        target_id=budget.id,
        target_name=f"{name} budget",
        current_cents=budget.limit_cents,
        proposed_cents=limit_cents,
    )
    ctx.tools_used.append(ToolUse(name="propose_budget_limit", label="Prepared a budget change"))
    return {"status": "awaiting_user_approval", "title": ctx.proposal.title}


_NULLABLE_GOAL = {"type": ["string", "null"], "description": "Savings goal id, or null"}
_AMOUNT = {"type": "string", "description": "CAD amount exactly as the user gave it, e.g. 1299.99"}


def _spec(name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


TOOL_SPECS = [
    _spec(
        "check_affordability",
        "Can the user pay for an item now? Reserves upcoming bills.",
        {"item": {"type": "string"}, "price": _AMOUNT},
    ),
    _spec(
        "plan_savings",
        "Monthly saving needed to buy an item within a number of months.",
        {
            "item": {"type": "string"},
            "price": _AMOUNT,
            "months": {"type": "integer", "description": "1 to 36"},
            "goal_id": _NULLABLE_GOAL,
        },
    ),
    _spec(
        "compare_payment_options",
        "Compare paying upfront with a monthly payment plan. Only use terms the user gave.",
        {
            "item": {"type": "string"},
            "price": _AMOUNT,
            "monthly_payment": _AMOUNT,
            "payment_count": {"type": "integer"},
            "upfront_fee": {"type": "string", "description": "CAD amount, or 0 if none"},
        },
    ),
    _spec(
        "project_goal",
        "When a savings goal is reached at a given monthly contribution.",
        {"goal_id": {"type": "string"}, "monthly_contribution": _AMOUNT},
    ),
    _spec(
        "simulate_spending_cut",
        "Effect of spending less in a category each month, optionally on a goal's timeline.",
        {"category": {"type": "string"}, "monthly_cut": _AMOUNT, "goal_id": _NULLABLE_GOAL},
    ),
    _spec(
        "credit_card_payment",
        "Credit card balance and utilization after a payment.",
        {"payment": _AMOUNT},
    ),
    _spec(
        "list_transactions",
        "Transactions this month and up to 3 earlier months.",
        {
            "category": {"type": ["string", "null"]},
            "months_back": {"type": "integer", "description": "0 = this month only, up to 3"},
        },
    ),
    _spec(
        "propose_goal_contribution",
        "Prepare a savings-goal contribution for the user to approve. Never applied automatically.",
        {"goal_id": {"type": "string"}, "amount": _AMOUNT, "reason": {"type": "string"}},
    ),
    _spec(
        "propose_budget_limit",
        "Prepare a new monthly budget limit for the user to approve. Never applied automatically.",
        {"category": {"type": "string"}, "new_limit": _AMOUNT, "reason": {"type": "string"}},
    ),
]

_HANDLERS: dict[str, Callable[..., dict[str, Any]]] = {
    "check_affordability": check_affordability,
    "plan_savings": plan_savings,
    "compare_payment_options": compare_payment_options,
    "project_goal": project_goal,
    "simulate_spending_cut": simulate_spending_cut,
    "credit_card_payment": credit_card_payment,
    "list_transactions": list_transactions,
    "propose_goal_contribution": propose_goal_contribution,
    "propose_budget_limit": propose_budget_limit,
}


def run_tool(ctx: CoachContext, name: str, raw_arguments: str) -> str:
    """Run one model tool call and return its JSON result (errors are returned, not raised)."""
    handler = _HANDLERS.get(name)
    if not handler:
        return json.dumps({"error": f"Unknown tool {name}"})
    try:
        arguments = json.loads(raw_arguments or "{}")
        if not isinstance(arguments, dict):
            raise ToolError("Arguments must be an object")
        return json.dumps(handler(ctx, **arguments), default=str)
    except (ToolError, TypeError, json.JSONDecodeError) as error:
        return json.dumps({"error": str(error)})

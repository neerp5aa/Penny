import time

from app.auth import CurrentUser
from app.config import Settings
from app.council.guard import validate_user_question
from app.council.llm import OpenAIExplainer
from app.council.models import (
    AgentViewpoint,
    CouncilLimits,
    CouncilRequest,
    CouncilResponse,
    GoalChangeProposal,
    QuantitativeClaim,
    RecommendedAction,
    Scenario,
    VerificationResult,
)
from app.council.proposals import goal_proposal_store
from app.council.tools import (
    calculate_affordability,
    calculate_savings_plan,
    get_budget_summary,
    simulate_budget_change,
    verify_financial_plan,
)
from app.dashboard_store import DashboardStore

MAX_DEBATE_ROUNDS = 1
MAX_TOOL_CALLS = 5
MAX_OUTPUT_TOKENS = 700
MAX_EXECUTION_MS = 6_500


class CouncilOrchestrator:
    def __init__(self, store: DashboardStore, settings: Settings) -> None:
        self._store = store
        self._explainer = OpenAIExplainer(settings)

    async def analyze(self, request: CouncilRequest, current_user: CurrentUser) -> CouncilResponse:
        started = time.perf_counter()
        question = validate_user_question(request.question)
        context = self._store.dashboard_for_user(current_user.id)
        summary = get_budget_summary(context)
        missing = []
        if not request.purchase_name:
            missing.append("What are you considering buying?")
        if request.purchase_cents is None:
            missing.append("What is the total purchase price in CAD?")
        if request.time_horizon_months is None:
            missing.append("When do you need to make the purchase?")
        if missing:
            return CouncilResponse(
                status="needs_information",
                decision="needs_information",
                summary="Council needs a few concrete details before comparing options.",
                selected_agents=["Savvy", "Max", "Joy"],
                missing_information=missing,
                assumptions=[],
                viewpoints=[],
                disagreements=[],
                quantitative_claims=[],
                scenarios=[],
                recommended_actions=[
                    RecommendedAction(
                        title="Add the missing details",
                        rationale="Penny will not guess a price or timeline.",
                        priority="now",
                    )
                ],
                verification=VerificationResult(verified=False, checks=[], issues=missing),
                goal_change_proposal=None,
                llm_status="not_needed",
                limits=self._limits(started, tool_calls=1, output_tokens=0),
            )

        purchase_cents = request.purchase_cents
        horizon = request.time_horizon_months
        goal = (
            self._store.goal_for_user(current_user.id, request.savings_goal_id)
            if request.savings_goal_id
            else None
        )
        affordability = calculate_affordability(summary, purchase_cents)
        budget_change = simulate_budget_change(summary, purchase_cents)
        savings_plan = calculate_savings_plan(summary, purchase_cents, horizon, goal)
        verification = verify_financial_plan(summary, affordability, budget_change, savings_plan)
        if not verification.verified:
            raise RuntimeError("Council financial verification failed")

        if not affordability.can_pay_from_available_cash:
            decision = "wait"
        elif (
            affordability.covered_by_monthly_cash_flow
            and budget_change.budget_remaining_after_cents >= 0
        ):
            decision = "buy_now"
        elif savings_plan.feasible_from_current_cash_flow:
            decision = "save_then_buy"
        else:
            decision = "wait"

        facts = {
            "user_question_data": question,
            "purchase_name_data": request.purchase_name,
            "decision": decision,
            "affordability": affordability.model_dump(),
            "budget_change": budget_change.model_dump(),
            "savings_plan": savings_plan.model_dump(),
            "verification": verification.model_dump(),
        }
        llm_result = await self._explainer.explain(facts)
        fallback = {
            "savvy": (
                "Protect the emergency buffer and do not treat every available dollar "
                "as safe to spend."
            ),
            "max": (
                "A staged savings plan preserves more flexibility than absorbing the "
                "purchase in one month."
            ),
            "joy": (
                "A realistic plan should leave room for irregular student costs and "
                "avoid making daily life too tight."
            ),
            "comparison": (
                "Council agrees the purchase can fit only if the plan protects near-term "
                "flexibility; the main disagreement is how much caution to keep afterward."
            ),
        }
        explanations = llm_result.explanations
        claims = [
            QuantitativeClaim(
                id="purchase",
                label="Laptop price",
                value_cents=purchase_cents,
                source_tool="calculate_affordability",
            ),
            QuantitativeClaim(
                id="available",
                label="Available balance",
                value_cents=summary.available_balance_cents,
                source_tool="get_budget_summary",
            ),
            QuantitativeClaim(
                id="available_after",
                label="Balance after buying now",
                value_cents=affordability.available_after_purchase_cents,
                source_tool="calculate_affordability",
            ),
            QuantitativeClaim(
                id="cash_flow",
                label="Current monthly cash flow",
                value_cents=summary.cash_flow_cents,
                source_tool="get_budget_summary",
            ),
            QuantitativeClaim(
                id="buy_now_flow",
                label="Cash flow if bought this month",
                value_cents=budget_change.cash_flow_after_cents,
                source_tool="simulate_budget_change",
            ),
            QuantitativeClaim(
                id="monthly_saving",
                label="Required monthly saving",
                value_cents=savings_plan.monthly_contribution_cents,
                source_tool="calculate_savings_plan",
            ),
        ]
        viewpoints = [
            AgentViewpoint(
                agent="Savvy",
                role="Security and risk",
                stance="cautious",
                headline="Keep your safety cushion intact",
                reasoning=explanations.savvy_reasoning if explanations else fallback["savvy"],
                assumptions=[
                    "Cash purchase with no financing",
                    "Emergency savings are not disposable income",
                ],
                tradeoffs=[
                    "Buying now provides the laptop sooner",
                    "Waiting protects flexibility for unexpected costs",
                ],
                claim_ids=["available", "available_after", "buy_now_flow"],
            ),
            AgentViewpoint(
                agent="Max",
                role="Planning and trade-offs",
                stance="conditional",
                headline="Use a staged savings plan",
                reasoning=explanations.max_reasoning if explanations else fallback["max"],
                assumptions=[
                    "Current income and spending remain stable",
                    "The selected timeline is flexible",
                ],
                tradeoffs=[
                    "Saving first delays the purchase",
                    "The monthly plan avoids a single large budget shock",
                ],
                claim_ids=["cash_flow", "monthly_saving", "buy_now_flow"],
            ),
            AgentViewpoint(
                agent="Joy",
                role="Lifestyle and realism",
                stance="conditional",
                headline="Make the plan livable",
                reasoning=explanations.joy_reasoning if explanations else fallback["joy"],
                assumptions=[
                    "The laptop is useful but not an emergency",
                    "Student expenses can vary month to month",
                ],
                tradeoffs=[
                    "A faster purchase may help schoolwork",
                    "A tight month can create stress elsewhere",
                ],
                claim_ids=["purchase", "monthly_saving"],
            ),
        ]
        scenarios = [
            Scenario(
                name="Buy now",
                description="Record the full purchase in the current month.",
                cash_flow_after_cents=budget_change.cash_flow_after_cents,
                budget_remaining_after_cents=budget_change.budget_remaining_after_cents,
            ),
            Scenario(
                name="Save first",
                description="Contribute to the selected laptop goal before purchasing.",
                cash_flow_after_cents=savings_plan.cash_flow_after_contribution_cents,
                budget_remaining_after_cents=summary.budget_remaining_cents,
                months=horizon,
            ),
            Scenario(
                name="Keep current plan",
                description="Make no purchase or savings-goal change yet.",
                cash_flow_after_cents=summary.cash_flow_cents,
                budget_remaining_after_cents=summary.budget_remaining_cents,
            ),
        ]
        proposal_response = None
        if goal and savings_plan.monthly_contribution_cents > 0:
            contribution = min(
                savings_plan.monthly_contribution_cents,
                goal.target_cents - goal.current_cents,
            )
            if contribution > 0:
                proposal = goal_proposal_store.create(
                    owner_user_id=current_user.id,
                    goal_id=goal.id,
                    expected_current_cents=goal.current_cents,
                    contribution_cents=contribution,
                )
                proposal_response = GoalChangeProposal(
                    proposal_id=proposal.id,
                    proposal_version=proposal.version,
                    goal_id=goal.id,
                    goal_name=goal.name,
                    current_cents=goal.current_cents,
                    contribution_cents=contribution,
                    proposed_current_cents=goal.current_cents + contribution,
                    requires_approval=True,
                )

        decision_summary = {
            "buy_now": "Council verifies that the purchase fits the current monthly plan.",
            "save_then_buy": "Council recommends saving toward the purchase before buying.",
            "wait": (
                "Council recommends waiting because the current plan does not safely "
                "support the purchase."
            ),
        }[decision]
        return CouncilResponse(
            status="complete",
            decision=decision,
            summary=decision_summary,
            selected_agents=["Savvy", "Max", "Joy"],
            missing_information=[],
            assumptions=[
                "The purchase is paid in cash without financing or interest.",
                "Only the authenticated user's current fictional financial context is used.",
                "Income and spending remain unchanged during the selected timeline.",
            ],
            viewpoints=viewpoints,
            disagreements=[
                explanations.comparison_summary if explanations else fallback["comparison"]
            ],
            quantitative_claims=claims,
            scenarios=scenarios,
            recommended_actions=[
                RecommendedAction(
                    title="Use the save-first scenario",
                    rationale=(
                        "It passes deterministic cash-flow verification while preserving "
                        "more flexibility."
                    ),
                    priority="now",
                ),
                RecommendedAction(
                    title="Re-run Council after financial changes",
                    rationale=(
                        "New income, spending, or savings changes the verified recommendation."
                    ),
                    priority="next",
                ),
                RecommendedAction(
                    title="Compare a lower-cost option",
                    rationale="A smaller purchase would reduce the budget trade-off.",
                    priority="optional",
                ),
            ],
            verification=verification,
            goal_change_proposal=proposal_response,
            llm_status=llm_result.status,
            limits=self._limits(started, tool_calls=5, output_tokens=llm_result.output_tokens),
        )

    @staticmethod
    def _limits(started: float, tool_calls: int, output_tokens: int) -> CouncilLimits:
        return CouncilLimits(
            debate_rounds_used=1 if tool_calls > 1 else 0,
            debate_rounds_max=MAX_DEBATE_ROUNDS,
            tool_calls_used=tool_calls,
            tool_calls_max=MAX_TOOL_CALLS,
            output_tokens_used=output_tokens,
            output_tokens_max=MAX_OUTPUT_TOKENS,
            execution_ms=int((time.perf_counter() - started) * 1_000),
            execution_ms_max=MAX_EXECUTION_MS,
        )

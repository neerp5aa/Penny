import asyncio
from dataclasses import asdict
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from app.auth import CurrentUser, get_current_user
from app.config import get_settings
from app.council.models import (
    ApprovalRequest,
    ApprovalResponse,
    CouncilRequest,
    CouncilResponse,
)
from app.council.orchestrator import MAX_EXECUTION_MS, CouncilOrchestrator
from app.council.proposals import goal_proposal_store
from app.dashboard_models import (
    BudgetCopyRequest,
    BudgetPatch,
    BudgetWrite,
    CreditUtilizationRequest,
    CreditUtilizationResponse,
    DashboardResponse,
    GoalContributionRequest,
    GoalPatch,
    GoalWrite,
    HistoryResponse,
    TransactionPatch,
    TransactionWrite,
)
from app.dashboard_store import dashboard_store
from app.domain.finance import (
    COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS,
    TransactionAmount,
    TransactionKind,
    build_summary,
    credit_utilization_basis_points,
)
from app.fixtures import build_demo_dashboard
from app.models import (
    CurrentUserResponse,
    DemoDashboardResponse,
    HealthResponse,
    Summary,
    SummaryRequest,
)

settings = get_settings()
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
# Optional month (any day in it) whose snapshot a mutation should return; defaults to today.
ViewMonth = Annotated[date | None, Query(description="Month to return, e.g. 2026-09-01")]
app = FastAPI(title="Penny API", version="0.1.0", docs_url="/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.frontend_origin).rstrip("/")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="penny-api", version=app.version)


@app.get(
    "/api/v1/demo/dashboard",
    response_model=DemoDashboardResponse,
    tags=["demo"],
)
def demo_dashboard(current_user: AuthenticatedUser) -> DemoDashboardResponse:
    """Return a clearly fictional, deterministic dashboard snapshot."""
    dashboard_store.require_owner(current_user.id)
    return build_demo_dashboard()


@app.get("/api/v1/me", response_model=CurrentUserResponse, tags=["auth"])
def me(current_user: AuthenticatedUser) -> CurrentUserResponse:
    """Echo the verified identity so sign-in can be tested without touching financial data."""
    return CurrentUserResponse(
        user_id=current_user.id,
        email=current_user.email,
        auth_method=current_user.auth_method,
        has_demo_financial_data=dashboard_store.is_owner(current_user.id),
    )


@app.post(
    "/api/v1/calculations/summary",
    response_model=Summary,
    tags=["calculations"],
)
def calculate_summary(request: SummaryRequest) -> Summary:
    """Calculate an authoritative summary using integer cents only."""
    result = build_summary(
        transactions=[
            TransactionAmount(item.amount_cents, TransactionKind(item.kind))
            for item in request.transactions
        ],
        budget_cents=request.budget_cents,
        contributions_cents=request.savings_contributions_cents,
    )
    return Summary(**asdict(result))


@app.get("/api/v1/dashboard", response_model=DashboardResponse, tags=["dashboard"])
def dashboard(current_user: AuthenticatedUser, month: ViewMonth = None) -> DashboardResponse:
    return dashboard_store.dashboard_for_user(current_user.id, month)


def _in_view(result: DashboardResponse, user: CurrentUser, month: date | None) -> DashboardResponse:
    return dashboard_store.dashboard_for_user(user.id, month) if month else result


@app.post("/api/v1/transactions", response_model=DashboardResponse, tags=["transactions"])
def create_transaction(
    request: TransactionWrite, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.create_transaction(current_user.id, request), current_user, month
    )


@app.patch(
    "/api/v1/transactions/{transaction_id}",
    response_model=DashboardResponse,
    tags=["transactions"],
)
def update_transaction(
    transaction_id: str,
    request: TransactionPatch,
    current_user: AuthenticatedUser,
    month: ViewMonth = None,
) -> DashboardResponse:
    return _in_view(
        dashboard_store.update_transaction(current_user.id, transaction_id, request),
        current_user,
        month,
    )


@app.delete(
    "/api/v1/transactions/{transaction_id}",
    response_model=DashboardResponse,
    tags=["transactions"],
)
def delete_transaction(
    transaction_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.delete_transaction(current_user.id, transaction_id), current_user, month
    )


@app.post("/api/v1/budgets", response_model=DashboardResponse, tags=["budgets"])
def create_budget(
    request: BudgetWrite, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.create_budget(current_user.id, request), current_user, month)


@app.patch(
    "/api/v1/budgets/{budget_id}",
    response_model=DashboardResponse,
    tags=["budgets"],
)
def update_budget(
    budget_id: str, request: BudgetPatch, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.update_budget(current_user.id, budget_id, request), current_user, month
    )


@app.delete(
    "/api/v1/budgets/{budget_id}",
    response_model=DashboardResponse,
    tags=["budgets"],
)
def delete_budget(
    budget_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.delete_budget(current_user.id, budget_id), current_user, month)


@app.post("/api/v1/savings-goals", response_model=DashboardResponse, tags=["goals"])
def create_goal(
    request: GoalWrite, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.create_goal(current_user.id, request), current_user, month)


@app.patch(
    "/api/v1/savings-goals/{goal_id}",
    response_model=DashboardResponse,
    tags=["goals"],
)
def update_goal(
    goal_id: str, request: GoalPatch, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.update_goal(current_user.id, goal_id, request), current_user, month
    )


@app.delete(
    "/api/v1/savings-goals/{goal_id}",
    response_model=DashboardResponse,
    tags=["goals"],
)
def delete_goal(
    goal_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.delete_goal(current_user.id, goal_id), current_user, month)


@app.post("/api/v1/budgets/copy", response_model=DashboardResponse, tags=["budgets"])
def copy_budgets(request: BudgetCopyRequest, current_user: AuthenticatedUser) -> DashboardResponse:
    """Copy category limits from one month into another, skipping categories already budgeted."""
    return dashboard_store.copy_budgets(current_user.id, request.from_month, request.to_month)


@app.post(
    "/api/v1/savings-goals/{goal_id}/contributions",
    response_model=DashboardResponse,
    tags=["goals"],
)
def contribute_to_goal(
    goal_id: str,
    request: GoalContributionRequest,
    current_user: AuthenticatedUser,
    month: ViewMonth = None,
) -> DashboardResponse:
    return _in_view(
        dashboard_store.contribute_to_goal(current_user.id, goal_id, request.amount_cents),
        current_user,
        month,
    )


@app.post(
    "/api/v1/missions/{mission_id}/complete",
    response_model=DashboardResponse,
    tags=["missions"],
)
def complete_mission(
    mission_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.complete_mission(current_user.id, mission_id), current_user, month
    )


@app.get("/api/v1/history", response_model=HistoryResponse, tags=["history"])
def history(
    current_user: AuthenticatedUser,
    start: Annotated[date, Query(description="First month in the range")],
    end: Annotated[date, Query(description="Last month in the range")],
) -> HistoryResponse:
    """Monthly totals and category spending for a range of up to 24 months."""
    return dashboard_store.history_for_user(current_user.id, start, end)


@app.post(
    "/api/v1/calculations/credit-utilization",
    response_model=CreditUtilizationResponse,
    tags=["calculations"],
)
def calculate_credit_utilization(request: CreditUtilizationRequest) -> CreditUtilizationResponse:
    """Educational what-if: utilization in integer basis points. Not a credit-score prediction."""
    basis_points = credit_utilization_basis_points(
        request.balance_cents, request.credit_limit_cents
    )
    return CreditUtilizationResponse(
        balance_cents=request.balance_cents,
        credit_limit_cents=request.credit_limit_cents,
        utilization_basis_points=basis_points,
        within_common_guideline=basis_points <= COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS,
    )


@app.post("/api/v1/council/analyze", response_model=CouncilResponse, tags=["council"])
async def analyze_with_council(
    request: CouncilRequest,
    current_user: AuthenticatedUser,
) -> CouncilResponse:
    orchestrator = CouncilOrchestrator(dashboard_store, get_settings())
    try:
        return await asyncio.wait_for(
            orchestrator.analyze(request, current_user),
            timeout=MAX_EXECUTION_MS / 1_000,
        )
    except TimeoutError as error:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Council reached its execution limit; no change was made",
        ) from error


@app.post(
    "/api/v1/council/proposals/{proposal_id}/approve",
    response_model=ApprovalResponse,
    tags=["council"],
)
def approve_council_goal_change(
    proposal_id: str,
    request: ApprovalRequest,
    current_user: AuthenticatedUser,
) -> ApprovalResponse:
    dashboard_store.require_owner(current_user.id)
    proposal = goal_proposal_store.consume_for_approval(
        proposal_id, current_user.id, request.proposal_version
    )
    dashboard = dashboard_store.apply_approved_goal_contribution(
        user_id=current_user.id,
        goal_id=proposal.goal_id,
        expected_current_cents=proposal.expected_current_cents,
        contribution_cents=proposal.contribution_cents,
    )
    return ApprovalResponse(
        status="applied",
        message="The approved fictional savings contribution was applied.",
        dashboard=dashboard,
    )

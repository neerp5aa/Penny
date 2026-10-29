import asyncio
from dataclasses import asdict
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
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
    BudgetPatch,
    BudgetWrite,
    DashboardResponse,
    GoalPatch,
    GoalWrite,
    TransactionPatch,
    TransactionWrite,
)
from app.dashboard_store import dashboard_store
from app.domain.finance import TransactionAmount, TransactionKind, build_summary
from app.fixtures import build_demo_dashboard
from app.models import DemoDashboardResponse, HealthResponse, Summary, SummaryRequest

settings = get_settings()
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
def demo_dashboard() -> DemoDashboardResponse:
    """Return a clearly fictional, deterministic dashboard snapshot."""
    return build_demo_dashboard()


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
def dashboard() -> DashboardResponse:
    return dashboard_store.dashboard()


@app.post("/api/v1/transactions", response_model=DashboardResponse, tags=["transactions"])
def create_transaction(request: TransactionWrite) -> DashboardResponse:
    return dashboard_store.create_transaction(request)


@app.patch(
    "/api/v1/transactions/{transaction_id}",
    response_model=DashboardResponse,
    tags=["transactions"],
)
def update_transaction(transaction_id: str, request: TransactionPatch) -> DashboardResponse:
    return dashboard_store.update_transaction(transaction_id, request)


@app.delete(
    "/api/v1/transactions/{transaction_id}",
    response_model=DashboardResponse,
    tags=["transactions"],
)
def delete_transaction(transaction_id: str) -> DashboardResponse:
    return dashboard_store.delete_transaction(transaction_id)


@app.post("/api/v1/budgets", response_model=DashboardResponse, tags=["budgets"])
def create_budget(request: BudgetWrite) -> DashboardResponse:
    return dashboard_store.create_budget(request)


@app.patch(
    "/api/v1/budgets/{budget_id}",
    response_model=DashboardResponse,
    tags=["budgets"],
)
def update_budget(budget_id: str, request: BudgetPatch) -> DashboardResponse:
    return dashboard_store.update_budget(budget_id, request)


@app.delete(
    "/api/v1/budgets/{budget_id}",
    response_model=DashboardResponse,
    tags=["budgets"],
)
def delete_budget(budget_id: str) -> DashboardResponse:
    return dashboard_store.delete_budget(budget_id)


@app.post("/api/v1/savings-goals", response_model=DashboardResponse, tags=["goals"])
def create_goal(request: GoalWrite) -> DashboardResponse:
    return dashboard_store.create_goal(request)


@app.patch(
    "/api/v1/savings-goals/{goal_id}",
    response_model=DashboardResponse,
    tags=["goals"],
)
def update_goal(goal_id: str, request: GoalPatch) -> DashboardResponse:
    return dashboard_store.update_goal(goal_id, request)


@app.delete(
    "/api/v1/savings-goals/{goal_id}",
    response_model=DashboardResponse,
    tags=["goals"],
)
def delete_goal(goal_id: str) -> DashboardResponse:
    return dashboard_store.delete_goal(goal_id)


@app.post("/api/v1/council/analyze", response_model=CouncilResponse, tags=["council"])
async def analyze_with_council(
    request: CouncilRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
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
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ApprovalResponse:
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

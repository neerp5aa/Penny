from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.auth import CurrentUser, get_current_user
from app.coach.coach import Coach
from app.coach.models import (
    ApprovalRequest,
    ApprovalResponse,
    BriefResponse,
    ChatRequest,
    ChatResponse,
)
from app.config import get_settings
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
    credit_utilization_basis_points,
)
from app.models import CurrentUserResponse, HealthResponse

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


@app.get("/api/v1/me", response_model=CurrentUserResponse, tags=["auth"])
def me(current_user: AuthenticatedUser) -> CurrentUserResponse:
    """Echo the verified identity so sign-in can be tested without touching financial data."""
    return CurrentUserResponse(
        user_id=current_user.id,
        email=current_user.email,
        auth_method=current_user.auth_method,
        has_demo_financial_data=dashboard_store.is_owner(current_user.id),
    )


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


@app.post(
    "/api/v1/upcoming-bills/{bill_id}/mark-paid",
    response_model=DashboardResponse,
    tags=["bills"],
)
def mark_upcoming_bill_paid(
    bill_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    """Record a user attestation only; this is not a verified bank payment."""
    return _in_view(dashboard_store.mark_bill_paid(current_user.id, bill_id), current_user, month)


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


def _coach() -> Coach:
    return Coach(dashboard_store, get_settings())


@app.get("/api/v1/coach/brief", response_model=BriefResponse, tags=["coach"])
def coach_brief(current_user: AuthenticatedUser) -> BriefResponse:
    """Deterministic check-in signals for the current month; no model call."""
    return _coach().brief(current_user.id)


@app.post("/api/v1/coach/chat", response_model=ChatResponse, tags=["coach"])
async def coach_chat(request: ChatRequest, current_user: AuthenticatedUser) -> ChatResponse:
    """Answer the latest question using the user's verified data and deterministic tools."""
    return await _coach().chat(request, current_user.id)


@app.post(
    "/api/v1/coach/proposals/{proposal_id}/approve",
    response_model=ApprovalResponse,
    tags=["coach"],
)
def approve_coach_proposal(
    proposal_id: str, request: ApprovalRequest, current_user: AuthenticatedUser
) -> ApprovalResponse:
    """Apply a change Penny proposed, only after the user explicitly approves it."""
    return _coach().approve(current_user.id, proposal_id, request.version)

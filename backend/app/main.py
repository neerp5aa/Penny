from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from app.auth import CurrentUser, get_current_user
from app.coach import assist
from app.coach.assist import AssistText, BudgetSuggestions, ParsedTransaction, QuickAddRequest
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
    AccountPatch,
    AccountWrite,
    BillHistory,
    BillPatch,
    BillWrite,
    BudgetCopyRequest,
    BudgetPatch,
    BudgetWrite,
    CategorySuggestion,
    CategoryWrite,
    CreditUtilizationRequest,
    CreditUtilizationResponse,
    DashboardResponse,
    GoalContributionRequest,
    GoalPatch,
    GoalWrite,
    GrowthPoint,
    GrowthRequest,
    GrowthResponse,
    HistoryResponse,
    ImportRequest,
    ImportResult,
    PaySchedule,
    SplitTransactionWrite,
    TransactionPatch,
    TransactionWrite,
)
from app.dashboard_store import dashboard_store
from app.domain.categorize import categorize, necessity
from app.domain.finance import (
    COMMON_UTILIZATION_GUIDELINE_BASIS_POINTS,
    credit_utilization_basis_points,
    growth_projection,
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
def dashboard(
    current_user: AuthenticatedUser,
    month: ViewMonth = None,
    start: Annotated[date | None, Query(description="Start of a custom period")] = None,
    end: Annotated[date | None, Query(description="End of a custom period (inclusive)")] = None,
) -> DashboardResponse:
    """One month (default: this month), or any period up to 36 months with start and end."""
    if (start is None) != (end is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Send both start and end")
    if start and end:
        return dashboard_store.dashboard_for_range(current_user.id, start, end)
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


@app.post("/api/v1/transactions/split", response_model=DashboardResponse, tags=["transactions"])
def create_split_transaction(
    request: SplitTransactionWrite, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    """Record one purchase or deposit across several accounts (one transaction each)."""
    return _in_view(
        dashboard_store.create_split_transaction(current_user.id, request), current_user, month
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
        dashboard_store.contribute_to_goal(
            current_user.id, goal_id, request.amount_cents, request.from_account_id
        ),
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


@app.post("/api/v1/bills", response_model=DashboardResponse, tags=["bills"])
def create_bill(
    request: BillWrite, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.create_bill(current_user.id, request), current_user, month)


@app.patch("/api/v1/bills/{bill_id}", response_model=DashboardResponse, tags=["bills"])
def update_bill(
    bill_id: str, request: BillPatch, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(
        dashboard_store.update_bill(current_user.id, bill_id, request), current_user, month
    )


@app.delete("/api/v1/bills/{bill_id}", response_model=DashboardResponse, tags=["bills"])
def delete_bill(
    bill_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    return _in_view(dashboard_store.delete_bill(current_user.id, bill_id), current_user, month)


@app.get("/api/v1/bills/{bill_id}/history", response_model=BillHistory, tags=["bills"])
def bill_history(bill_id: str, current_user: AuthenticatedUser) -> BillHistory:
    """Every recorded payment of a bill, newest first, with totals."""
    return dashboard_store.bill_history(current_user.id, bill_id)


@app.post("/api/v1/bills/{bill_id}/mark-paid", response_model=DashboardResponse, tags=["bills"])
def mark_bill_paid(
    bill_id: str, current_user: AuthenticatedUser, month: ViewMonth = None
) -> DashboardResponse:
    """Record this payment as a transaction and move the bill to its next due date."""
    return _in_view(dashboard_store.mark_bill_paid(current_user.id, bill_id), current_user, month)


@app.put("/api/v1/pay-schedule", response_model=DashboardResponse, tags=["pay cycle"])
def set_pay_schedule(request: PaySchedule, current_user: AuthenticatedUser) -> DashboardResponse:
    return dashboard_store.set_pay_schedule(current_user.id, request)


@app.post("/api/v1/categories", response_model=DashboardResponse, tags=["categories"])
def create_category(request: CategoryWrite, current_user: AuthenticatedUser) -> DashboardResponse:
    return dashboard_store.create_category(current_user.id, request)


@app.delete(
    "/api/v1/categories/{category_id}", response_model=DashboardResponse, tags=["categories"]
)
def delete_category(category_id: str, current_user: AuthenticatedUser) -> DashboardResponse:
    return dashboard_store.delete_category(current_user.id, category_id)


@app.post("/api/v1/accounts", response_model=DashboardResponse, tags=["accounts"])
def create_account(request: AccountWrite, current_user: AuthenticatedUser) -> DashboardResponse:
    return dashboard_store.create_account(current_user.id, request)


@app.patch("/api/v1/accounts/{account_id}", response_model=DashboardResponse, tags=["accounts"])
def rename_account(
    account_id: str, request: AccountPatch, current_user: AuthenticatedUser
) -> DashboardResponse:
    return dashboard_store.rename_account(current_user.id, account_id, request.name)


@app.delete("/api/v1/accounts/{account_id}", response_model=DashboardResponse, tags=["accounts"])
def delete_account(account_id: str, current_user: AuthenticatedUser) -> DashboardResponse:
    return dashboard_store.delete_account(current_user.id, account_id)


@app.post("/api/v1/transactions/import", response_model=ImportResult, tags=["transactions"])
def import_transactions(request: ImportRequest, current_user: AuthenticatedUser) -> ImportResult:
    """Add history from a CSV export. Imported rows don't change current account balances."""
    imported, errors = dashboard_store.import_csv(current_user.id, request.csv, request.account_id)
    return ImportResult(
        imported=imported,
        skipped=len(errors),
        errors=errors[:20],
        dashboard=dashboard_store.dashboard_for_user(current_user.id),
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


@app.get("/api/v1/categorize", response_model=CategorySuggestion, tags=["transactions"])
async def suggest_category(
    current_user: AuthenticatedUser,
    description: Annotated[str, Query(min_length=1, max_length=160)],
    kind: Annotated[Literal["income", "spending"], Query()] = "spending",
) -> CategorySuggestion:
    """Keyword rules first; when they don't recognise the merchant, the model picks a category."""
    dashboard_store.require_owner(current_user.id)
    categories = dashboard_store.dashboard_for_user(current_user.id).categories
    result = categorize(description, kind)
    category_id, source = result.category_id, "rules" if result.category_id else None
    if category_id is None:
        category_id = await assist.pick_category(get_settings(), description, kind, categories)
        source = "ai" if category_id else None
    names = {c.id: c.name for c in categories}
    return CategorySuggestion(
        category_id=category_id,
        category_name=names.get(category_id) if category_id else None,
        necessity=necessity(description, category_id) if kind == "spending" else None,
        matched=result.matched,
        source=source,
    )


@app.post("/api/v1/assist/parse-transaction", response_model=ParsedTransaction, tags=["assist"])
async def parse_transaction(
    request: QuickAddRequest, current_user: AuthenticatedUser
) -> ParsedTransaction:
    """Turn a one-line note into transaction fields. Nothing is saved; the user confirms."""
    dashboard_store.require_owner(current_user.id)
    categories = dashboard_store.dashboard_for_user(current_user.id).categories
    return await assist.parse_transaction(
        get_settings(), request.text.strip(), dashboard_store.today(), categories
    )


@app.get("/api/v1/assist/spending-take", response_model=AssistText, tags=["assist"])
async def spending_take(
    current_user: AuthenticatedUser,
    month: ViewMonth = None,
    start: Annotated[date | None, Query()] = None,
    end: Annotated[date | None, Query()] = None,
) -> AssistText:
    """Three short points about the period on screen, grounded in its totals."""
    if (start is None) != (end is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Send both start and end")
    view = (
        dashboard_store.dashboard_for_range(current_user.id, start, end)
        if start and end
        else dashboard_store.dashboard_for_user(current_user.id, month)
    )
    return await assist.spending_take(get_settings(), view)


@app.get("/api/v1/assist/budget-suggestions", response_model=BudgetSuggestions, tags=["assist"])
async def budget_suggestions(current_user: AuthenticatedUser) -> BudgetSuggestions:
    """Suggested limits from recent spending. Applying any of them is a separate user action."""
    dashboard_store.require_owner(current_user.id)
    return await assist.budget_suggestions(get_settings(), dashboard_store, current_user.id)


@app.get("/api/v1/assist/lesson-example/{lesson_id}", response_model=AssistText, tags=["assist"])
async def lesson_example(lesson_id: str, current_user: AuthenticatedUser) -> AssistText:
    """Connect a lesson to the user's own fictional numbers."""
    dashboard_store.require_owner(current_user.id)
    result = await assist.lesson_example(
        get_settings(), dashboard_store, current_user.id, lesson_id
    )
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    return result


@app.post(
    "/api/v1/lessons/{lesson_id}/complete", response_model=DashboardResponse, tags=["learning"]
)
def complete_lesson(lesson_id: str, current_user: AuthenticatedUser) -> DashboardResponse:
    """Record a passed lesson quiz. Idempotent, so XP is awarded once."""
    return dashboard_store.complete_lesson(current_user.id, lesson_id)


@app.post("/api/v1/calculations/growth", response_model=GrowthResponse, tags=["calculations"])
def calculate_growth(request: GrowthRequest) -> GrowthResponse:
    """Educational compounding illustration at an assumed rate. Not a forecast or advice."""
    args = (request.initial_cents, request.monthly_cents, request.years)
    with_fee = growth_projection(
        *args, request.annual_return_basis_points, request.annual_fee_basis_points
    )
    without_fee = growth_projection(*args, request.annual_return_basis_points, 0)
    _, contributed, balance = with_fee[-1]
    return GrowthResponse(
        points=[GrowthPoint(year=y, contributed_cents=c, balance_cents=b) for y, c, b in with_fee],
        contributed_cents=contributed,
        balance_cents=balance,
        growth_cents=balance - contributed,
        fees_cost_cents=without_fee[-1][2] - balance,
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

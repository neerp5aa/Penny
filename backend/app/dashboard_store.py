from collections.abc import Iterable
from dataclasses import asdict
from datetime import date
from threading import RLock
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.dashboard_models import (
    BudgetPatch,
    BudgetWrite,
    Category,
    CategorySpending,
    CreditSnapshot,
    DailySpending,
    DashboardResponse,
    DashboardTotals,
    Goal,
    GoalPatch,
    GoalWrite,
    HistoryMonth,
    HistoryResponse,
    HistoryTotals,
    Mission,
    MonthlyBudget,
    TransactionPatch,
    TransactionWrite,
)
from app.domain.finance import (
    TransactionAmount,
    TransactionKind,
    average_cents,
    build_summary,
    share_basis_points,
)
from app.fixtures import build_demo_dashboard
from app.history_fixtures import build_history_budgets, build_history_transactions
from app.models import Transaction

MAX_HISTORY_MONTHS = 24


def month_start(value: date) -> date:
    return value.replace(day=1)


def _next_month(value: date) -> date:
    return date(value.year + value.month // 12, value.month % 12 + 1, 1)


def _same_month(value: date, month: date) -> bool:
    return value.year == month.year and value.month == month.month


class DashboardStore:
    """Thread-safe fictional store for the hackathon MVP."""

    # The demo's "today". Past months come from the fictional history fixture.
    active_month = date(2026, 10, 1)

    def __init__(self, owner_user_ids: Iterable[str] = ()) -> None:
        fixture = build_demo_dashboard()
        self._profile = fixture.profile
        # The fictional data set is owned by the demo identity plus any explicitly configured
        # Supabase user ids. Every public operation checks the caller against this set.
        self._owner_user_ids = frozenset({self._profile.id, *owner_user_ids})
        self._accounts = {item.id: item for item in fixture.accounts}
        self._categories = {
            item.id: item
            for item in [
                Category(id="cat-income", name="Income", colour_token="emerald"),
                Category(id="cat-housing", name="Housing", colour_token="rose"),
                Category(id="cat-food", name="Food", colour_token="amber"),
                Category(id="cat-transport", name="Transportation", colour_token="sky"),
                Category(id="cat-phone", name="Phone", colour_token="violet"),
                Category(id="cat-school", name="School", colour_token="indigo"),
                Category(id="cat-fun", name="Fun", colour_token="pink"),
                Category(id="cat-health", name="Health", colour_token="emerald"),
            ]
        }
        category_ids = {category.name: category.id for category in self._categories.values()}
        self._transactions = {
            item.id: item.model_copy(
                update={
                    "account_id": "acct-chequing",
                    "category_id": category_ids.get(item.category),
                }
            )
            for item in fixture.transactions
        }
        self._transactions.update({item.id: item for item in build_history_transactions()})
        self._budgets = {
            f"budget-{index}": {
                "id": f"budget-{index}",
                "category_id": category_ids[item.category],
                "month_start": self.active_month,
                "limit_cents": item.limit_cents,
            }
            for index, item in enumerate(fixture.budgets, start=1)
        }
        self._budgets.update({str(item["id"]): item for item in build_history_budgets()})
        self._goals = {
            "goal-emergency": {
                "id": "goal-emergency",
                "name": fixture.savings_goal.name,
                "target_cents": fixture.savings_goal.target_cents,
                "current_cents": fixture.savings_goal.current_cents,
                "target_date": fixture.savings_goal.target_date,
                "status": "active",
            },
            "goal-laptop": {
                "id": "goal-laptop",
                "name": "Laptop fund",
                "target_cents": 120_000,
                "current_cents": 30_000,
                "target_date": date(2027, 1, 31),
                "status": "active",
            },
        }
        self._missions = [
            Mission(
                id="mission-review",
                title="Review three recent purchases",
                description="Check their categories and make sure each one supports your plan.",
                xp_reward=40,
                completed=False,
            ),
            Mission(
                id="mission-save",
                title="Protect your next $15",
                description="Move a fictional $15 toward your emergency fund this week.",
                xp_reward=60,
                completed=True,
            ),
            Mission(
                id="mission-budget",
                title="Give every spending category a limit",
                description="Check that each category you spend in has a monthly budget.",
                xp_reward=50,
                completed=False,
            ),
            Mission(
                id="mission-credit",
                title="Learn your credit utilization",
                description="Open Credit basics and see how your fictional card balance compares.",
                xp_reward=30,
                completed=False,
            ),
            Mission(
                id="mission-council",
                title="Ask before a big purchase",
                description="Ask the Council about something you are thinking of buying.",
                xp_reward=50,
                completed=False,
            ),
        ]
        self._lock = RLock()

    def _monthly_transactions(self, month: date) -> list[Transaction]:
        return [
            item for item in self._transactions.values() if _same_month(item.occurred_on, month)
        ]

    def _monthly_budgets(self, month: date) -> list[dict]:
        return [item for item in self._budgets.values() if item["month_start"] == month]

    def _data_months(self) -> list[date]:
        months = {month_start(item.occurred_on) for item in self._transactions.values()}
        months.update(item["month_start"] for item in self._budgets.values())
        months.add(self.active_month)
        return sorted(month for month in months if month <= self.active_month)

    def _category_breakdown(
        self, transactions: Iterable[Transaction]
    ) -> tuple[dict[str | None, int], list[CategorySpending]]:
        spending_by_category: dict[str | None, int] = {}
        for item in transactions:
            if item.kind == "spending":
                spending_by_category[item.category_id] = (
                    spending_by_category.get(item.category_id, 0) + item.amount_cents
                )
        total = sum(spending_by_category.values())
        breakdown = []
        for category_id, spent in sorted(
            spending_by_category.items(), key=lambda pair: pair[1], reverse=True
        ):
            category = self._categories.get(category_id) if category_id else None
            breakdown.append(
                CategorySpending(
                    category_id=category_id,
                    category_name=category.name if category else "Uncategorized",
                    colour_token=category.colour_token if category else "slate",
                    spent_cents=spent,
                    share_basis_points=share_basis_points(spent, total),
                )
            )
        return spending_by_category, breakdown

    def _snapshot(self, month: date | None = None) -> DashboardResponse:
        with self._lock:
            month = month_start(month or self.active_month)
            monthly = sorted(
                self._monthly_transactions(month), key=lambda item: item.occurred_on, reverse=True
            )
            domain_transactions = [
                TransactionAmount(item.amount_cents, TransactionKind(item.kind)) for item in monthly
            ]
            monthly_budgets = self._monthly_budgets(month)
            total_budget = sum(item["limit_cents"] for item in monthly_budgets)
            summary = build_summary(domain_transactions, total_budget, [])
            spending_by_category, breakdown = self._category_breakdown(monthly)
            budgets = []
            for item in monthly_budgets:
                category = self._categories[item["category_id"]]
                spent = spending_by_category.get(category.id, 0)
                budgets.append(
                    MonthlyBudget(
                        **item,
                        category_name=category.name,
                        spent_cents=spent,
                        remaining_cents=item["limit_cents"] - spent,
                        usage_basis_points=(spent * 10_000 // item["limit_cents"])
                        if item["limit_cents"]
                        else 0,
                    )
                )
            daily: list[DailySpending] = []
            running = 0
            for day in sorted({item.occurred_on for item in monthly if item.kind == "spending"}):
                spent = sum(
                    item.amount_cents
                    for item in monthly
                    if item.kind == "spending" and item.occurred_on == day
                )
                running += spent
                daily.append(DailySpending(day=day, spent_cents=spent, cumulative_cents=running))
            goals = [
                Goal(
                    **item,
                    progress_basis_points=min(
                        10_000, item["current_cents"] * 10_000 // item["target_cents"]
                    ),
                )
                for item in self._goals.values()
            ]
            credit_account = next(
                item for item in self._accounts.values() if item.account_type == "credit"
            )
            credit_limit = credit_account.credit_limit_cents or 1
            asset_balance = sum(
                item.balance_cents
                for item in self._accounts.values()
                if item.account_type != "credit"
            )
            return DashboardResponse(
                active_month=month,
                current_month=self.active_month,
                data_months=self._data_months(),
                profile=self._profile,
                accounts=list(self._accounts.values()),
                categories=list(self._categories.values()),
                transactions=monthly,
                budgets=sorted(budgets, key=lambda item: item.category_name),
                savings_goals=goals,
                missions=self._missions,
                xp_total=sum(item.xp_reward for item in self._missions if item.completed),
                category_spending=breakdown,
                daily_spending=daily,
                credit=CreditSnapshot(
                    account_id=credit_account.id,
                    account_name=credit_account.name,
                    balance_cents=credit_account.balance_cents,
                    credit_limit_cents=credit_limit,
                    utilization_basis_points=credit_account.balance_cents * 10_000 // credit_limit,
                ),
                totals=DashboardTotals(
                    **asdict(summary),
                    available_balance_cents=asset_balance,
                    total_budget_cents=total_budget,
                ),
            )

    def history_for_user(self, user_id: str, start: date, end: date) -> HistoryResponse:
        self.require_owner(user_id)
        start, end = month_start(start), month_start(end)
        if start > end:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "start must not be after end"
            )
        months: list[date] = [start]
        while months[-1] < end:
            months.append(_next_month(months[-1]))
            if len(months) > MAX_HISTORY_MONTHS:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"History is limited to {MAX_HISTORY_MONTHS} months per request",
                )
        with self._lock:
            rows = []
            in_range: list[Transaction] = []
            for month in months:
                monthly = self._monthly_transactions(month)
                in_range.extend(monthly)
                summary = build_summary(
                    [
                        TransactionAmount(item.amount_cents, TransactionKind(item.kind))
                        for item in monthly
                    ],
                    0,
                    [],
                )
                rows.append(
                    HistoryMonth(
                        month=month,
                        income_cents=summary.income_cents,
                        spending_cents=summary.spending_cents,
                        cash_flow_cents=summary.cash_flow_cents,
                        budget_cents=sum(
                            item["limit_cents"] for item in self._monthly_budgets(month)
                        ),
                        transaction_count=len(monthly),
                    )
                )
            _, categories = self._category_breakdown(in_range)
            income = sum(row.income_cents for row in rows)
            spending = sum(row.spending_cents for row in rows)
            active = sum(1 for row in rows if row.transaction_count)
            return HistoryResponse(
                start=start,
                end=end,
                months=rows,
                totals=HistoryTotals(
                    income_cents=income,
                    spending_cents=spending,
                    cash_flow_cents=income - spending,
                    months_with_activity=active,
                    average_spending_cents=average_cents(spending, active),
                ),
                categories=categories,
                data_months=self._data_months(),
            )

    def copy_budgets(self, user_id: str, from_month: date, to_month: date) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            from_month, to_month = month_start(from_month), month_start(to_month)
            if from_month == to_month:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a different month"
                )
            existing = {item["category_id"] for item in self._monthly_budgets(to_month)}
            source = [
                item
                for item in self._monthly_budgets(from_month)
                if item["category_id"] not in existing
            ]
            if not source:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "There are no new budgets to copy from that month"
                )
            for item in source:
                budget_id = f"budget-{uuid4().hex[:12]}"
                self._budgets[budget_id] = {
                    "id": budget_id,
                    "category_id": item["category_id"],
                    "month_start": to_month,
                    "limit_cents": item["limit_cents"],
                }
            return self._snapshot(to_month)

    def contribute_to_goal(
        self, user_id: str, goal_id: str, amount_cents: int
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal = self._goals.get(goal_id)
            if not goal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            remaining = goal["target_cents"] - goal["current_cents"]
            if remaining <= 0:
                raise HTTPException(status.HTTP_409_CONFLICT, "This goal has already been reached")
            if amount_cents > remaining:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "That is more than the amount left to reach this goal",
                )
            goal["current_cents"] += amount_cents
            if goal["current_cents"] == goal["target_cents"]:
                goal["status"] = "completed"
            return self._snapshot()

    def complete_mission(self, user_id: str, mission_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            index = next(
                (i for i, item in enumerate(self._missions) if item.id == mission_id), None
            )
            if index is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
            # Idempotent: completing twice never awards XP twice.
            self._missions[index] = self._missions[index].model_copy(update={"completed": True})
            return self._snapshot()

    def is_owner(self, user_id: str) -> bool:
        return user_id in self._owner_user_ids

    def require_owner(self, user_id: str) -> None:
        if not self.is_owner(user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Financial context is not available")

    def dashboard_for_user(self, user_id: str, month: date | None = None) -> DashboardResponse:
        self.require_owner(user_id)
        if month and month_start(month) > self.active_month:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That month is in the future"
            )
        return self._snapshot(month)

    def goal_for_user(self, user_id: str, goal_id: str) -> Goal:
        dashboard = self.dashboard_for_user(user_id)
        goal = next((item for item in dashboard.savings_goals if item.id == goal_id), None)
        if not goal:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
        return goal

    def apply_approved_goal_contribution(
        self,
        user_id: str,
        goal_id: str,
        expected_current_cents: int,
        contribution_cents: int,
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal = self._goals.get(goal_id)
            if not goal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            if goal["current_cents"] != expected_current_cents:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "Savings goal changed after this proposal was created",
                )
            if contribution_cents <= 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid contribution")
            goal["current_cents"] = min(
                goal["target_cents"], goal["current_cents"] + contribution_cents
            )
            if goal["current_cents"] >= goal["target_cents"]:
                goal["status"] = "completed"
            return self._snapshot()

    def create_transaction(self, user_id: str, request: TransactionWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            self._validate_transaction_references(request.account_id, request.category_id)
            transaction = Transaction(
                id=f"tx-{uuid4().hex[:12]}",
                description=request.description,
                category=self._category_name(request.category_id),
                account_id=request.account_id,
                category_id=request.category_id,
                amount_cents=request.amount_cents,
                kind=request.kind,
                occurred_on=request.occurred_on,
            )
            self._apply_account_effect(transaction, 1)
            self._transactions[transaction.id] = transaction
            return self._snapshot()

    def update_transaction(
        self, user_id: str, transaction_id: str, request: TransactionPatch
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            existing = self._transaction(transaction_id)
            values = request.model_dump(exclude_unset=True)
            account_id = values.get("account_id", existing.account_id)
            category_id = values.get("category_id", existing.category_id)
            self._validate_transaction_references(account_id, category_id)
            accounts_before = self._accounts.copy()
            try:
                self._apply_account_effect(existing, -1)
                updated = existing.model_copy(
                    update={
                        **values,
                        "category": self._category_name(category_id),
                    }
                )
                self._apply_account_effect(updated, 1)
            except Exception:
                self._accounts = accounts_before
                raise
            self._transactions[transaction_id] = updated
            return self._snapshot()

    def delete_transaction(self, user_id: str, transaction_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            existing = self._transaction(transaction_id)
            self._apply_account_effect(existing, -1)
            del self._transactions[transaction_id]
            return self._snapshot()

    def create_budget(self, user_id: str, request: BudgetWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            self._category(request.category_id)
            if request.month_start.day != 1:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "month_start must be the first of a month",
                )
            if any(
                item["category_id"] == request.category_id
                and item["month_start"] == request.month_start
                for item in self._budgets.values()
            ):
                raise HTTPException(status.HTTP_409_CONFLICT, "Budget already exists")
            budget_id = f"budget-{uuid4().hex[:12]}"
            self._budgets[budget_id] = {"id": budget_id, **request.model_dump()}
            return self._snapshot()

    def update_budget(
        self, user_id: str, budget_id: str, request: BudgetPatch
    ) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if budget_id not in self._budgets:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            self._budgets[budget_id]["limit_cents"] = request.limit_cents
            return self._snapshot()

    def delete_budget(self, user_id: str, budget_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if self._budgets.pop(budget_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            return self._snapshot()

    def create_goal(self, user_id: str, request: GoalWrite) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            goal_id = f"goal-{uuid4().hex[:12]}"
            self._goals[goal_id] = {
                "id": goal_id,
                **request.model_dump(),
                "status": "active",
            }
            return self._snapshot()

    def update_goal(self, user_id: str, goal_id: str, request: GoalPatch) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if goal_id not in self._goals:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            self._goals[goal_id].update(request.model_dump(exclude_unset=True))
            return self._snapshot()

    def delete_goal(self, user_id: str, goal_id: str) -> DashboardResponse:
        with self._lock:
            self.require_owner(user_id)
            if self._goals.pop(goal_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            return self._snapshot()

    def _transaction(self, transaction_id: str) -> Transaction:
        transaction = self._transactions.get(transaction_id)
        if not transaction:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
        return transaction

    def _category(self, category_id: str) -> Category:
        category = self._categories.get(category_id)
        if not category:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown category")
        return category

    def _category_name(self, category_id: str | None) -> str:
        return self._category(category_id).name if category_id else "Uncategorized"

    def _validate_transaction_references(self, account_id: str, category_id: str | None) -> None:
        if account_id not in self._accounts:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown account")
        if category_id:
            self._category(category_id)

    def _apply_account_effect(self, transaction: Transaction, multiplier: int) -> None:
        account = self._accounts[transaction.account_id]
        direction = 1 if transaction.kind == "income" else -1
        if account.account_type == "credit":
            direction *= -1
        new_balance = account.balance_cents + transaction.amount_cents * direction * multiplier
        if new_balance < 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Transaction would make the account balance negative",
            )
        self._accounts[account.id] = account.model_copy(update={"balance_cents": new_balance})


def _configured_owner_ids() -> tuple[str, ...]:
    owner = get_settings().demo_owner_user_id
    return (owner,) if owner else ()


dashboard_store = DashboardStore(owner_user_ids=_configured_owner_ids())

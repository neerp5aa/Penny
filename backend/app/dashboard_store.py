from dataclasses import asdict
from datetime import date
from threading import RLock
from uuid import uuid4

from fastapi import HTTPException, status

from app.dashboard_models import (
    BudgetPatch,
    BudgetWrite,
    Category,
    CategorySpending,
    CreditSnapshot,
    DashboardResponse,
    DashboardTotals,
    Goal,
    GoalPatch,
    GoalWrite,
    Mission,
    MonthlyBudget,
    TransactionPatch,
    TransactionWrite,
)
from app.domain.finance import TransactionAmount, TransactionKind, build_summary
from app.fixtures import build_demo_dashboard
from app.models import Transaction


class DashboardStore:
    """Thread-safe fictional store for the hackathon MVP."""

    active_month = date(2026, 10, 1)

    def __init__(self) -> None:
        fixture = build_demo_dashboard()
        self._profile = fixture.profile
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
        self._budgets = {
            f"budget-{index}": {
                "id": f"budget-{index}",
                "category_id": category_ids[item.category],
                "month_start": self.active_month,
                "limit_cents": item.limit_cents,
            }
            for index, item in enumerate(fixture.budgets, start=1)
        }
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
        ]
        self._lock = RLock()

    def dashboard(self) -> DashboardResponse:
        with self._lock:
            transactions = sorted(
                self._transactions.values(), key=lambda item: item.occurred_on, reverse=True
            )
            monthly = [
                item
                for item in transactions
                if item.occurred_on.year == self.active_month.year
                and item.occurred_on.month == self.active_month.month
            ]
            domain_transactions = [
                TransactionAmount(item.amount_cents, TransactionKind(item.kind)) for item in monthly
            ]
            total_budget = sum(item["limit_cents"] for item in self._budgets.values())
            summary = build_summary(domain_transactions, total_budget, [])
            spending_by_category: dict[str | None, int] = {}
            for item in monthly:
                if item.kind == "spending":
                    spending_by_category[item.category_id] = (
                        spending_by_category.get(item.category_id, 0) + item.amount_cents
                    )
            spending_total = summary.spending_cents
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
                        share_basis_points=(spent * 10_000 // spending_total)
                        if spending_total
                        else 0,
                    )
                )
            budgets = []
            for item in self._budgets.values():
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
                active_month=self.active_month,
                profile=self._profile,
                accounts=list(self._accounts.values()),
                categories=list(self._categories.values()),
                transactions=transactions,
                budgets=sorted(budgets, key=lambda item: item.category_name),
                savings_goals=goals,
                missions=self._missions,
                category_spending=breakdown,
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

    def dashboard_for_user(self, user_id: str) -> DashboardResponse:
        if user_id != self._profile.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Financial context is not available")
        return self.dashboard()

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
            self.dashboard_for_user(user_id)
            goal = self._goals.get(goal_id)
            if not goal:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            if goal["current_cents"] != expected_current_cents:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "Savings goal changed after this proposal was created",
                )
            if contribution_cents <= 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid contribution")
            goal["current_cents"] = min(
                goal["target_cents"], goal["current_cents"] + contribution_cents
            )
            if goal["current_cents"] >= goal["target_cents"]:
                goal["status"] = "completed"
            return self.dashboard()

    def create_transaction(self, request: TransactionWrite) -> DashboardResponse:
        with self._lock:
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
            return self.dashboard()

    def update_transaction(
        self, transaction_id: str, request: TransactionPatch
    ) -> DashboardResponse:
        with self._lock:
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
            return self.dashboard()

    def delete_transaction(self, transaction_id: str) -> DashboardResponse:
        with self._lock:
            existing = self._transaction(transaction_id)
            self._apply_account_effect(existing, -1)
            del self._transactions[transaction_id]
            return self.dashboard()

    def create_budget(self, request: BudgetWrite) -> DashboardResponse:
        with self._lock:
            self._category(request.category_id)
            if any(
                item["category_id"] == request.category_id
                and item["month_start"] == request.month_start
                for item in self._budgets.values()
            ):
                raise HTTPException(status.HTTP_409_CONFLICT, "Budget already exists")
            budget_id = f"budget-{uuid4().hex[:12]}"
            self._budgets[budget_id] = {"id": budget_id, **request.model_dump()}
            return self.dashboard()

    def update_budget(self, budget_id: str, request: BudgetPatch) -> DashboardResponse:
        with self._lock:
            if budget_id not in self._budgets:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            self._budgets[budget_id]["limit_cents"] = request.limit_cents
            return self.dashboard()

    def delete_budget(self, budget_id: str) -> DashboardResponse:
        with self._lock:
            if self._budgets.pop(budget_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
            return self.dashboard()

    def create_goal(self, request: GoalWrite) -> DashboardResponse:
        with self._lock:
            goal_id = f"goal-{uuid4().hex[:12]}"
            self._goals[goal_id] = {
                "id": goal_id,
                **request.model_dump(),
                "status": "active",
            }
            return self.dashboard()

    def update_goal(self, goal_id: str, request: GoalPatch) -> DashboardResponse:
        with self._lock:
            if goal_id not in self._goals:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            self._goals[goal_id].update(request.model_dump(exclude_unset=True))
            return self.dashboard()

    def delete_goal(self, goal_id: str) -> DashboardResponse:
        with self._lock:
            if self._goals.pop(goal_id, None) is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Savings goal not found")
            return self.dashboard()

    def _transaction(self, transaction_id: str) -> Transaction:
        transaction = self._transactions.get(transaction_id)
        if not transaction:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
        return transaction

    def _category(self, category_id: str) -> Category:
        category = self._categories.get(category_id)
        if not category:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown category")
        return category

    def _category_name(self, category_id: str | None) -> str:
        return self._category(category_id).name if category_id else "Uncategorized"

    def _validate_transaction_references(self, account_id: str, category_id: str | None) -> None:
        if account_id not in self._accounts:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown account")
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
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Transaction would make the account balance negative",
            )
        self._accounts[account.id] = account.model_copy(update={"balance_cents": new_balance})


dashboard_store = DashboardStore()

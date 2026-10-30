import pytest
from fastapi.testclient import TestClient

from app import main
from app.dashboard_store import DashboardStore
from app.domain.finance import average_cents, credit_utilization_basis_points, share_basis_points
from app.main import app
from tests.conftest import DEMO_TOKEN

client = TestClient(app)
headers = {"Authorization": f"Bearer {DEMO_TOKEN}"}


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "dashboard_store", DashboardStore())


def get(path: str, **params: str) -> dict:
    response = client.get(path, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ------------------------------------------------------------------ months & history


def test_current_month_is_unchanged_by_history() -> None:
    payload = get("/api/v1/dashboard")
    assert payload["active_month"] == payload["current_month"] == "2026-10-01"
    assert payload["totals"]["income_cents"] == 176_400
    assert payload["totals"]["spending_cents"] == 126_516
    assert payload["totals"]["total_budget_cents"] == 148_000
    assert len(payload["transactions"]) == 9
    assert payload["data_months"][0] == "2025-09-01"
    assert payload["data_months"][-1] == "2026-10-01"
    assert len(payload["data_months"]) == 14


def test_past_month_snapshot_uses_only_that_month() -> None:
    payload = get("/api/v1/dashboard", month="2026-09-17")
    assert payload["active_month"] == "2026-09-01"
    assert payload["current_month"] == "2026-10-01"
    assert {item["occurred_on"][:7] for item in payload["transactions"]} == {"2026-09"}
    assert payload["totals"]["income_cents"] == 121_600 + 50_000
    assert payload["totals"]["spending_cents"] == 82_500 + 26_740 + 7_800 + 4_500 + 29_880 + 4_650
    assert payload["totals"]["total_budget_cents"] == 148_000
    school = next(item for item in payload["budgets"] if item["category_name"] == "School")
    assert school["remaining_cents"] == 10_000 - 29_880


def test_daily_spending_is_cumulative_and_matches_total() -> None:
    payload = get("/api/v1/dashboard")
    daily = payload["daily_spending"]
    assert [item["day"] for item in daily] == sorted(item["day"] for item in daily)
    assert daily[-1]["cumulative_cents"] == payload["totals"]["spending_cents"]
    assert sum(item["spent_cents"] for item in daily) == payload["totals"]["spending_cents"]


def test_future_month_is_rejected() -> None:
    assert (
        client.get("/api/v1/dashboard", headers=headers, params={"month": "2026-11-01"}).status_code
        == 422
    )


def test_history_totals_add_up() -> None:
    payload = get("/api/v1/history", start="2025-09-01", end="2026-10-01")
    months = payload["months"]
    assert len(months) == 14
    assert months[-1]["income_cents"] == 176_400
    totals = payload["totals"]
    assert totals["income_cents"] == sum(row["income_cents"] for row in months)
    assert totals["spending_cents"] == sum(row["spending_cents"] for row in months)
    assert totals["cash_flow_cents"] == totals["income_cents"] - totals["spending_cents"]
    assert totals["months_with_activity"] == 14
    assert totals["average_spending_cents"] == totals["spending_cents"] // 14
    assert sum(item["spent_cents"] for item in payload["categories"]) == totals["spending_cents"]


def test_history_handles_empty_months_and_limits() -> None:
    payload = get("/api/v1/history", start="2025-01-01", end="2025-03-01")
    assert [row["transaction_count"] for row in payload["months"]] == [0, 0, 0]
    assert payload["totals"]["average_spending_cents"] == 0
    too_long = client.get(
        "/api/v1/history", headers=headers, params={"start": "2024-01-01", "end": "2026-10-01"}
    )
    assert too_long.status_code == 422
    backwards = client.get(
        "/api/v1/history", headers=headers, params={"start": "2026-10-01", "end": "2026-01-01"}
    )
    assert backwards.status_code == 422


def test_mutation_returns_requested_month() -> None:
    response = client.post(
        "/api/v1/transactions",
        headers=headers,
        params={"month": "2026-09-01"},
        json={
            "description": "Fictional textbook resale",
            "account_id": "acct-chequing",
            "category_id": "cat-income",
            "amount_cents": 2_500,
            "kind": "income",
            "occurred_on": "2026-09-30",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_month"] == "2026-09-01"
    assert payload["totals"]["income_cents"] == 121_600 + 50_000 + 2_500


# ------------------------------------------------------------------ budgets


def test_copy_budgets_fills_only_missing_categories() -> None:
    september = get("/api/v1/dashboard", month="2026-09-01")
    fun = next(item for item in september["budgets"] if item["category_name"] == "Fun")
    client.delete(f"/api/v1/budgets/{fun['id']}", headers=headers)
    copied = client.post(
        "/api/v1/budgets/copy",
        headers=headers,
        json={"from_month": "2026-10-01", "to_month": "2026-09-01"},
    )
    assert copied.status_code == 200
    budgets = copied.json()["budgets"]
    assert len(budgets) == 6
    assert next(item for item in budgets if item["category_name"] == "Fun")["limit_cents"] == 8_000
    again = client.post(
        "/api/v1/budgets/copy",
        headers=headers,
        json={"from_month": "2026-10-01", "to_month": "2026-09-01"},
    )
    assert again.status_code == 409


def test_budget_month_must_start_on_the_first() -> None:
    response = client.post(
        "/api/v1/budgets",
        headers=headers,
        json={"category_id": "cat-health", "month_start": "2026-10-15", "limit_cents": 1_000},
    )
    assert response.status_code == 422


# ------------------------------------------------------------------ goals & missions


def contribute(goal_id: str, amount: int) -> int:
    return client.post(
        f"/api/v1/savings-goals/{goal_id}/contributions",
        headers=headers,
        json={"amount_cents": amount},
    ).status_code


def test_goal_contribution_adds_and_completes_at_target() -> None:
    assert contribute("goal-laptop", 10_000) == 200
    goal = next(
        item for item in get("/api/v1/dashboard")["savings_goals"] if item["id"] == "goal-laptop"
    )
    assert goal["current_cents"] == 40_000
    assert contribute("goal-laptop", 80_001) == 422
    assert contribute("goal-laptop", 0) == 422
    assert contribute("goal-laptop", 80_000) == 200
    goal = next(
        item for item in get("/api/v1/dashboard")["savings_goals"] if item["id"] == "goal-laptop"
    )
    assert goal["current_cents"] == goal["target_cents"]
    assert goal["status"] == "completed"
    assert contribute("goal-laptop", 1) == 409
    assert contribute("goal-missing", 1) == 404


def test_mission_completion_is_idempotent() -> None:
    before = get("/api/v1/dashboard")
    assert len(before["missions"]) == 5
    first = client.post("/api/v1/missions/mission-review/complete", headers=headers).json()
    second = client.post("/api/v1/missions/mission-review/complete", headers=headers).json()
    assert first["xp_total"] == before["xp_total"] + 40
    assert second["xp_total"] == first["xp_total"]
    assert client.post("/api/v1/missions/mission-nope/complete", headers=headers).status_code == 404


# ------------------------------------------------------------------ credit calculator & domain


def test_credit_utilization_calculator() -> None:
    response = client.post(
        "/api/v1/calculations/credit-utilization",
        json={"balance_cents": 24_380, "credit_limit_cents": 150_000},
    )
    assert response.json() == {
        "balance_cents": 24_380,
        "credit_limit_cents": 150_000,
        "utilization_basis_points": 1_625,
        "within_common_guideline": True,
    }
    over = client.post(
        "/api/v1/calculations/credit-utilization",
        json={"balance_cents": 45_150, "credit_limit_cents": 150_000},
    ).json()
    assert over["within_common_guideline"] is False
    zero_limit = client.post(
        "/api/v1/calculations/credit-utilization",
        json={"balance_cents": 1, "credit_limit_cents": 0},
    )
    assert zero_limit.status_code == 422


@pytest.mark.parametrize("value", [True, 1.5, -1])
def test_new_domain_functions_reject_invalid_values(value: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        share_basis_points(value, 100)  # type: ignore[arg-type]
    with pytest.raises((TypeError, ValueError)):
        credit_utilization_basis_points(value, 100)  # type: ignore[arg-type]


def test_new_domain_functions_are_exact() -> None:
    assert share_basis_points(1, 3) == 3_333
    assert share_basis_points(5, 0) == 0
    assert credit_utilization_basis_points(10**20, 3 * 10**20) == 3_333
    assert average_cents(10, 3) == 3
    assert average_cents(0, 0) == 0
    with pytest.raises(ValueError):
        credit_utilization_basis_points(1, 0)

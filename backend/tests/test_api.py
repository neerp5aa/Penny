from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import DEMO_TOKEN

client = TestClient(app)
auth_headers = {"Authorization": f"Bearer {DEMO_TOKEN}"}


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "penny-api",
        "version": "0.1.0",
    }


def test_demo_dashboard_is_fictional_and_deterministic() -> None:
    response = client.get("/api/v1/demo/dashboard", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["is_fictional"] is True
    assert payload["profile"]["currency"] == "CAD"
    assert payload["summary"] == {
        "income_cents": 176_400,
        "spending_cents": 126_516,
        "cash_flow_cents": 49_884,
        "budget_remaining_cents": 21_484,
        "savings_contributions_cents": 15_000,
    }


def test_typed_summary_request_uses_integer_cent_domain() -> None:
    response = client.post(
        "/api/v1/calculations/summary",
        json={
            "transactions": [
                {"amount_cents": 100_001, "kind": "income"},
                {"amount_cents": 40_002, "kind": "spending"},
            ],
            "budget_cents": 50_000,
            "savings_contributions_cents": [5_003],
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "income_cents": 100_001,
        "spending_cents": 40_002,
        "cash_flow_cents": 59_999,
        "budget_remaining_cents": 9_998,
        "savings_contributions_cents": 5_003,
    }


def test_typed_summary_request_rejects_negative_cents() -> None:
    response = client.post(
        "/api/v1/calculations/summary",
        json={
            "transactions": [{"amount_cents": -1, "kind": "income"}],
            "budget_cents": 0,
            "savings_contributions_cents": [],
        },
    )
    assert response.status_code == 422

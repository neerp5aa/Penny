import hashlib
import hmac
import json
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt.utils import base64url_encode
from pydantic import ValidationError

from app import auth, main
from app.config import Settings, get_settings
from app.dashboard_store import DashboardStore
from app.main import app
from tests.conftest import DEMO_TOKEN, TEST_SUPABASE_URL, make_settings

client = TestClient(app)

OWNER_ID = "6f1c0d5e-0000-4000-8000-00000000a11c"
OTHER_ID = "6f1c0d5e-0000-4000-8000-000000000b0b"
KID = "test-p256-key"
SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())

# One representative request per financial route group, with valid bodies so that
# any non-auth status would come from the store rather than request validation.
FINANCIAL_ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/api/v1/dashboard", None),
    ("GET", "/api/v1/demo/dashboard", None),
    (
        "POST",
        "/api/v1/transactions",
        {
            "description": "Fictional snack",
            "account_id": "acct-chequing",
            "category_id": "cat-food",
            "amount_cents": 500,
            "kind": "spending",
            "occurred_on": "2026-10-28",
        },
    ),
    ("PATCH", "/api/v1/transactions/tx-fun", {"amount_cents": 2_700}),
    ("DELETE", "/api/v1/transactions/tx-fun", None),
    (
        "POST",
        "/api/v1/budgets",
        {"category_id": "cat-health", "month_start": "2026-10-01", "limit_cents": 1_000},
    ),
    ("PATCH", "/api/v1/budgets/budget-1", {"limit_cents": 90_000}),
    ("DELETE", "/api/v1/budgets/budget-1", None),
    ("POST", "/api/v1/savings-goals", {"name": "Bike", "target_cents": 1_000, "current_cents": 0}),
    ("PATCH", "/api/v1/savings-goals/goal-laptop", {"current_cents": 40_000}),
    ("DELETE", "/api/v1/savings-goals/goal-laptop", None),
    (
        "POST",
        "/api/v1/council/analyze",
        {
            "question": "Can I afford a laptop?",
            "purchase_name": "Laptop",
            "purchase_cents": 120_000,
            "time_horizon_months": 3,
            "savings_goal_id": "goal-laptop",
        },
    ),
    ("GET", "/api/v1/history?start=2026-01-01&end=2026-10-01", None),
    ("POST", "/api/v1/budgets/copy", {"from_month": "2026-10-01", "to_month": "2026-09-01"}),
    ("POST", "/api/v1/savings-goals/goal-laptop/contributions", {"amount_cents": 100}),
    ("POST", "/api/v1/missions/mission-review/complete", None),
    (
        "POST",
        "/api/v1/council/proposals/proposal-unknown/approve",
        {"approved": True, "proposal_version": "v"},
    ),
]
ROUTE_IDS = [f"{method} {path}" for method, path, _ in FINANCIAL_ROUTES]


class FakeJWKSClient:
    def __init__(self, private_key: ec.EllipticCurvePrivateKey) -> None:
        public_jwk = jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
        self._key = jwt.PyJWK({**public_jwk, "kid": KID, "alg": "ES256"})

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        if jwt.get_unverified_header(token).get("kid") != KID:
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return self._key


class UnreachableJWKSClient:
    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        raise jwt.PyJWKClientConnectionError("connection refused")


def make_token(
    subject: str = OWNER_ID,
    *,
    key: ec.EllipticCurvePrivateKey = SIGNING_KEY,
    **claim_overrides: Any,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": subject,
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "email": "maya.fictional@example.com",
        "iat": now,
        "exp": now + 3_600,
    }
    claims.update(claim_overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": KID})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def call(method: str, path: str, body: dict[str, Any] | None, headers: dict[str, str]) -> int:
    return client.request(method, path, json=body, headers=headers).status_code


@pytest.fixture(autouse=True)
def isolated_store_and_jwks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "dashboard_store", DashboardStore(owner_user_ids=[OWNER_ID]))
    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeJWKSClient(SIGNING_KEY))


def use_settings(**overrides: Any) -> None:
    settings = make_settings(**overrides)
    app.dependency_overrides[get_settings] = lambda: settings


@pytest.mark.parametrize(("method", "path", "body"), FINANCIAL_ROUTES, ids=ROUTE_IDS)
def test_financial_routes_reject_missing_token(
    method: str, path: str, body: dict[str, Any] | None
) -> None:
    assert call(method, path, body, {}) == 401


@pytest.mark.parametrize(("method", "path", "body"), FINANCIAL_ROUTES, ids=ROUTE_IDS)
def test_financial_routes_reject_invalid_token(
    method: str, path: str, body: dict[str, Any] | None
) -> None:
    assert call(method, path, body, bearer("not-a-real-token")) == 401


@pytest.mark.parametrize(("method", "path", "body"), FINANCIAL_ROUTES, ids=ROUTE_IDS)
def test_financial_routes_forbid_signed_in_non_owner(
    method: str, path: str, body: dict[str, Any] | None
) -> None:
    assert call(method, path, body, bearer(make_token(OTHER_ID))) == 403


def test_non_owner_cannot_change_maya_data() -> None:
    owner = bearer(make_token())
    before = client.get("/api/v1/dashboard", headers=owner).json()
    for method, path, body in FINANCIAL_ROUTES:
        call(method, path, body, bearer(make_token(OTHER_ID)))
    assert client.get("/api/v1/dashboard", headers=owner).json() == before


def test_configured_supabase_owner_can_complete_crud() -> None:
    headers = bearer(make_token())
    created = client.post("/api/v1/transactions", headers=headers, json=FINANCIAL_ROUTES[2][2])
    assert created.status_code == 200
    transaction = next(
        item for item in created.json()["transactions"] if item["description"] == "Fictional snack"
    )
    deleted = client.delete(f"/api/v1/transactions/{transaction['id']}", headers=headers)
    assert deleted.status_code == 200
    assert (
        deleted.json()["totals"]
        == client.get("/api/v1/dashboard", headers=headers).json()["totals"]
    )


def test_me_reports_verified_supabase_identity() -> None:
    response = client.get("/api/v1/me", headers=bearer(make_token()))
    assert response.status_code == 200
    assert response.json() == {
        "user_id": OWNER_ID,
        "email": "maya.fictional@example.com",
        "auth_method": "supabase",
        "has_demo_financial_data": True,
    }
    other = client.get("/api/v1/me", headers=bearer(make_token(OTHER_ID))).json()
    assert other["has_demo_financial_data"] is False


@pytest.mark.parametrize(
    "token",
    [
        make_token(exp=int(time.time()) - 60),
        make_token(aud="anon"),
        make_token(iss="https://attacker.example/auth/v1"),
        make_token(role="anon"),
        make_token(sub=None),
        make_token(exp=None),
        make_token(key=OTHER_SIGNING_KEY),
        jwt.encode({"sub": OWNER_ID, "aud": "authenticated"}, None, algorithm="none"),
    ],
    ids=[
        "expired",
        "wrong-audience",
        "wrong-issuer",
        "anon-role",
        "missing-subject",
        "missing-expiry",
        "untrusted-signing-key",
        "unsigned",
    ],
)
def test_untrusted_jwts_are_rejected(token: str) -> None:
    assert client.get("/api/v1/me", headers=bearer(token)).status_code == 401


def test_hs256_token_signed_with_public_key_is_rejected() -> None:
    # Algorithm-confusion attack: HMAC-sign with the published public key. PyJWT refuses to
    # create such a token, so it is assembled by hand.
    public_pem = SIGNING_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = {"alg": "HS256", "typ": "JWT", "kid": KID}
    claims = {"sub": OWNER_ID, "aud": "authenticated", "role": "authenticated", "exp": 2**31}
    signing_input = b".".join(
        base64url_encode(json.dumps(part).encode()) for part in (header, claims)
    )
    signature = base64url_encode(hmac.new(public_pem, signing_input, hashlib.sha256).digest())
    forged = (signing_input + b"." + signature).decode()
    assert client.get("/api/v1/me", headers=bearer(forged)).status_code == 401


def test_unreachable_jwks_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_jwks_client", lambda url: UnreachableJWKSClient())
    assert client.get("/api/v1/me", headers=bearer(make_token())).status_code == 503


def test_demo_token_works_only_in_development() -> None:
    assert client.get("/api/v1/dashboard", headers=bearer(DEMO_TOKEN)).status_code == 200
    use_settings(environment="production", demo_auth_token=None)
    assert client.get("/api/v1/dashboard", headers=bearer(DEMO_TOKEN)).status_code == 401
    use_settings(environment="development", demo_auth_token=None)
    assert client.get("/api/v1/dashboard", headers=bearer(DEMO_TOKEN)).status_code == 401


@pytest.mark.parametrize("environment", ["production", "test"])
def test_demo_token_configuration_is_refused_outside_development(environment: str) -> None:
    with pytest.raises(ValidationError, match="PENNY_DEMO_AUTH_TOKEN"):
        Settings(_env_file=None, environment=environment, demo_auth_token="x")  # type: ignore[call-arg]


def test_jwks_url_is_derived_from_project_url() -> None:
    settings = make_settings(supabase_url="https://abc.supabase.co/")
    assert settings.supabase_issuer == "https://abc.supabase.co/auth/v1"
    assert settings.supabase_jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"

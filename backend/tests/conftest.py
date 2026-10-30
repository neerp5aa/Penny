from collections.abc import Iterator

import pytest

from app.config import Settings, get_settings
from app.main import app

DEMO_TOKEN = "penny-local-demo-token"
TEST_SUPABASE_URL = "https://penny-test.supabase.co"


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "development",
        "supabase_url": TEST_SUPABASE_URL,
        "demo_auth_token": DEMO_TOKEN,
        "openai_api_key": None,
    }
    values.update(overrides)
    # Never read a developer's .env or .env.local during tests.
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def test_settings() -> Iterator[Settings]:
    settings = make_settings()
    app.dependency_overrides[get_settings] = lambda: settings
    yield settings
    app.dependency_overrides.pop(get_settings, None)

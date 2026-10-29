from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PENNY_", extra="ignore")

    environment: str = "development"
    frontend_origin: AnyHttpUrl = AnyHttpUrl("http://localhost:3000")
    supabase_url: AnyHttpUrl | None = None
    supabase_anon_key: str | None = None
    supabase_jwt_secret: str | None = None
    demo_auth_token: str = "penny-local-demo-token"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    council_timeout_seconds: float = 6.0


@lru_cache
def get_settings() -> Settings:
    return Settings()

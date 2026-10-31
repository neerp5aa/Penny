from functools import lru_cache
from typing import Literal, Self

from pydantic import AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Later files win, so a developer's .env.local overrides the shared .env.
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"), env_prefix="PENNY_", extra="ignore"
    )

    environment: Literal["development", "test", "production"] = "development"
    frontend_origin: AnyHttpUrl = AnyHttpUrl("http://localhost:3000")
    supabase_url: AnyHttpUrl | None = None
    supabase_jwt_audience: str = "authenticated"
    # Legacy HS256 shared secret; hosted projects with asymmetric keys should leave it unset.
    supabase_jwt_secret: str | None = None
    # Fictional demo bearer token; accepted only when environment is "development".
    demo_auth_token: str | None = None
    # Supabase user id allowed to use the fictional Maya data set until PEN-002 persistence.
    demo_owner_user_id: str | None = None
    openai_api_key: str | None = None
    openai_model: str = "gpt-6.1-sol"
    # Upper bound for one coach reply, including every tool round and any revision.
    coach_timeout_seconds: float = 45.0
    # Email reminders over SMTP (Gmail app password, Resend, SendGrid, Postmark, ...). Without a
    # host, Penny runs in preview mode: reminders are composed and shown in Settings, not sent.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    # The From address, e.g. "Penny <reminders@example.com>". Defaults to the username.
    smtp_from: str | None = None
    # How often the server checks for due reminders; 0 turns the background check off.
    reminder_check_minutes: int = Field(default=60, ge=0, le=1440)

    @model_validator(mode="after")
    def _reject_demo_token_outside_development(self) -> Self:
        if self.demo_auth_token and self.environment != "development":
            raise ValueError("PENNY_DEMO_AUTH_TOKEN must not be set outside development")
        return self

    @property
    def supabase_issuer(self) -> str | None:
        if not self.supabase_url:
            return None
        return f"{str(self.supabase_url).rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str | None:
        issuer = self.supabase_issuer
        return f"{issuer}/.well-known/jwks.json" if issuer else None


@lru_cache
def get_settings() -> Settings:
    return Settings()

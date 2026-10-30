import logging
import secrets
from functools import lru_cache
from typing import Annotated, Literal

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict

from app.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

DEMO_USER_ID = "demo-maya-singh"
# Asymmetric algorithms Supabase can publish in its JWKS. HS256 is never accepted from
# this path, which prevents algorithm-confusion attacks using a public key as a secret.
JWKS_ALGORITHMS = ["ES256", "RS256"]
JWKS_CACHE_SECONDS = 600
JWKS_TIMEOUT_SECONDS = 5


class CurrentUser(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    email: str | None = None
    auth_method: Literal["supabase", "demo"] = "supabase"


def _unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache
def _jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        jwks_url,
        cache_jwk_set=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def _verification_key(token: str, settings: Settings) -> tuple[object, list[str]]:
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as error:
        raise _unauthorized("Invalid or expired access token") from error
    if algorithm in JWKS_ALGORITHMS and settings.supabase_jwks_url:
        try:
            signing_key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        except jwt.PyJWKClientConnectionError as error:
            logger.warning("JWKS fetch from %s failed: %s", settings.supabase_jwks_url, error)
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Unable to reach the identity provider to verify the access token",
            ) from error
        except jwt.PyJWTError as error:
            raise _unauthorized("Invalid or expired access token") from error
        return signing_key.key, JWKS_ALGORITHMS
    if algorithm == "HS256" and settings.supabase_jwt_secret:
        return settings.supabase_jwt_secret, ["HS256"]
    if not settings.supabase_jwks_url and not settings.supabase_jwt_secret:
        raise _unauthorized("Token validation is not configured")
    raise _unauthorized("Access token uses an unsupported signing algorithm")


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    token = credentials.credentials
    if (
        settings.environment == "development"
        and settings.demo_auth_token
        and secrets.compare_digest(token, settings.demo_auth_token)
    ):
        return CurrentUser(id=DEMO_USER_ID, auth_method="demo")
    key, algorithms = _verification_key(token, settings)
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.PyJWTError as error:
        raise _unauthorized("Invalid or expired access token") from error
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthorized("Access token is missing a subject")
    if payload.get("role") != "authenticated":
        raise _unauthorized("Access token is not for a signed-in user")
    email = payload.get("email")
    return CurrentUser(id=subject, email=email if isinstance(email, str) else None)

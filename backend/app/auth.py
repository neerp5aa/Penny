import secrets
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict

from app.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str


def _unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    token = credentials.credentials
    if settings.environment == "development" and secrets.compare_digest(
        token, settings.demo_auth_token
    ):
        return CurrentUser(id="demo-maya-singh")
    if not settings.supabase_jwt_secret:
        raise _unauthorized("Token validation is not configured")
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as error:
        raise _unauthorized("Invalid or expired access token") from error
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthorized("Access token is missing a subject")
    return CurrentUser(id=subject)

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import ALGORITHM, COOKIE_NAME, PRODUCTION, SECRET_KEY
from app.database import get_db
from app.models import User, WorkspaceSettings

PERMISSIONS = {
    "admin": [
        "upload",
        "download",
        "delete",
        "manage_staff",
        "view_audit",
        "view_alerts",
        "resolve_alerts",
        "manage_settings",
    ],
    "doctor": ["upload", "download"],
    "nurse": ["upload", "download"],
    "auditor": ["view_audit", "view_alerts"],
}
ITERATIONS = 600_000
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(hashed).decode()}"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        algorithm, iterations, salt, digest = hashed.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        computed = hashlib.pbkdf2_hmac(
            "sha256", plain.encode(), base64.b64decode(salt), int(iterations)
        )
        return hmac.compare_digest(computed, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


# A comparable verification path prevents trivially distinguishing unknown accounts.
DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def create_access_token(user: User, minutes: int = 60) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user.id),
            "v": user.token_version,
            "jti": secrets.token_urlsafe(16),
            "iat": now,
            "exp": now + timedelta(minutes=minutes),
            "iss": "medguard",
            "aud": "medguard-workspace",
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def set_session(response: Response, user: User, db: Session) -> str:
    workspace = db.get(WorkspaceSettings, 1)
    minutes = workspace.session_minutes if workspace else 60
    token = create_access_token(user, minutes)
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=PRODUCTION,
        samesite="lax",
        max_age=minutes * 60,
        path="/",
    )
    return token


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials if credentials else request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Please sign in to your workspace.")
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            issuer="medguard",
            audience="medguard-workspace",
            options={"require": ["exp", "iat", "sub", "v"]},
        )
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(401, "Your session has expired. Please sign in again.")
    if not user or not user.is_active or payload["v"] != user.token_version:
        raise HTTPException(401, "This session is no longer active. Please sign in again.")
    return user


def require(permission: str):
    def check(
        request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)
    ):
        if permission not in PERMISSIONS.get(user.role, []):
            from app.services import audit

            audit(
                db,
                user,
                "permission_denied",
                permission,
                request,
                outcome="blocked",
                detail="Role-based policy denied this action.",
            )
            db.commit()
            raise HTTPException(403, "Your role does not have permission to perform this action.")
        return user

    return check


def serialize_user(user: User):
    from app.services import iso

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "department": user.department,
        "is_active": user.is_active,
        "is_demo": user.is_demo,
        "permissions": PERMISSIONS.get(user.role, []),
        "last_login": iso(user.last_login),
        "created_at": iso(user.created_at),
    }

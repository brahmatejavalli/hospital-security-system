import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    DUMMY_HASH,
    get_current_user,
    hash_password,
    require,
    serialize_user,
    set_session,
    verify_password,
)
from app.config import COOKIE_NAME, DEMO_MODE
from app.database import get_db
from app.models import User, WorkspaceSettings, utcnow
from app.schemas import (
    AdminPasswordReset,
    PasswordUpdate,
    ProfileUpdate,
    UserCreate,
    UserLogin,
    UserUpdate,
)
from app.services import audit, client_ip, raise_security_alert

router = APIRouter()
attempts: dict[str, deque] = defaultdict(deque)
attempt_lock = threading.Lock()


def check_rate(request: Request, *, prefix="", limit=10):
    key = prefix + client_ip(request)
    now = time.monotonic()
    with attempt_lock:
        if len(attempts) > 10_000:
            for ip in list(attempts):
                if not attempts[ip] or now - attempts[ip][-1] > 900:
                    del attempts[ip]
        window = attempts[key]
        while window and now - window[0] > 900:
            window.popleft()
        if len(window) >= limit:
            raise HTTPException(
                429,
                "Too many sign-in attempts. Try again in 15 minutes.",
                headers={"Retry-After": "900"},
            )
        window.append(now)
        return len(window)


@router.post("/auth/login")
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    attempt_count = check_rate(request)
    user = db.query(User).filter(User.email == str(payload.email).lower()).first()
    valid = verify_password(payload.password, user.password if user else DUMMY_HASH)
    if not user or not valid or not user.is_active:
        audit(
            db,
            user,
            "sign_in",
            "Workspace sign-in",
            request,
            outcome="blocked",
            detail="Invalid credentials or inactive account.",
        )
        if attempt_count == 5:
            raise_security_alert(
                db,
                "Multiple failed sign-in attempts",
                "Five unsuccessful sign-in attempts were observed from the same source within 15 minutes.",
                request,
                "high",
            )
        db.commit()
        raise HTTPException(401, "The email or password is incorrect.")
    with attempt_lock:
        attempts.pop(client_ip(request), None)
    user.last_login = utcnow()
    audit(db, user, "sign_in", "Workspace sign-in", request)
    db.commit()
    token = set_session(response, user, db)
    return {"user": serialize_user(user), "access_token": token, "token_type": "bearer"}


@router.post("/auth/demo")
def demo_login(request: Request, response: Response, db: Session = Depends(get_db)):
    if not DEMO_MODE:
        raise HTTPException(404, "Demo access is disabled.")
    check_rate(request, prefix="demo:", limit=60)
    user = (
        db.query(User)
        .filter(User.is_demo.is_(True), User.role == "admin", User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(404, "The demo workspace is unavailable.")
    user.last_login = utcnow()
    audit(
        db,
        user,
        "sign_in",
        "Demo workspace sign-in",
        request,
        detail="Demo access enabled in development only.",
    )
    db.commit()
    set_session(response, user, db)
    return {"user": serialize_user(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return serialize_user(user)


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.token_version += 1
    audit(
        db,
        user,
        "sign_out",
        "Workspace session",
        request,
        detail="All existing sessions for this account were revoked.",
    )
    db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Signed out. All your sessions have been revoked."}


@router.patch("/auth/profile")
def update_profile(
    payload: ProfileUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.username = payload.username
    audit(db, user, "profile_updated", "Account profile", request)
    db.commit()
    return serialize_user(user)


@router.post("/auth/password")
def update_password(
    payload: PasswordUpdate,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.is_demo:
        raise HTTPException(
            400,
            "Demo account passwords cannot be changed. Add a team member to try password management.",
        )
    if not verify_password(payload.current_password, user.password):
        audit(
            db,
            user,
            "password_changed",
            "Account password",
            request,
            outcome="blocked",
            detail="Current password verification failed.",
        )
        db.commit()
        raise HTTPException(400, "Your current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(400, "Choose a new password different from your current password.")
    user.password = hash_password(payload.new_password)
    user.token_version += 1
    audit(
        db,
        user,
        "password_changed",
        "Account password",
        request,
        detail="All earlier sessions revoked.",
    )
    db.commit()
    set_session(response, user, db)
    return {"message": "Password updated. Other sessions have been signed out."}


@router.get("/staff")
def list_staff(
    q: str = "",
    role: str = "",
    status: str = "",
    page: int = 1,
    page_size: int = 12,
    user: User = Depends(require("manage_staff")),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if q:
        search = f"%{q[:100]}%"
        query = query.filter(
            or_(
                User.username.ilike(search), User.email.ilike(search), User.department.ilike(search)
            )
        )
    if role:
        query = query.filter(User.role == role)
    if status in ("active", "inactive"):
        query = query.filter(User.is_active.is_(status == "active"))
    total = query.count()
    page_size = max(1, min(page_size, 100))
    users = (
        query.order_by(User.is_active.desc(), User.created_at.desc())
        .offset((max(page, 1) - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [serialize_user(item) for item in users],
        "total": total,
        "page": max(page, 1),
        "page_size": page_size,
        "summary": {
            "total": db.query(User).count(),
            "active": db.query(User).filter(User.is_active.is_(True)).count(),
            "admins": db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count(),
            "departments": db.query(func.count(func.distinct(User.department))).scalar(),
        },
    }


@router.post("/staff", status_code=201)
def create_staff(
    payload: UserCreate,
    request: Request,
    user: User = Depends(require("manage_staff")),
    db: Session = Depends(get_db),
):
    member = User(
        username=payload.username,
        email=str(payload.email).lower(),
        password=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
    )
    db.add(member)
    try:
        db.flush()
        audit(
            db,
            user,
            "member_added",
            member.username,
            request,
            resource_id=str(member.id),
            detail=f"Assigned role: {member.role}.",
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A team member with this email already exists.")
    return serialize_user(member)


@router.patch("/staff/{member_id}")
def update_staff(
    member_id: int,
    payload: UserUpdate,
    request: Request,
    user: User = Depends(require("manage_staff")),
    db: Session = Depends(get_db),
):
    current_version = user.token_version
    # A no-op workspace-row update is a write lock on SQLite and a row lock on
    # MySQL/Postgres. Re-read the acting account after acquiring it, so mutual
    # concurrent administrator deactivations cannot leave a workspace locked out.
    db.execute(
        update(WorkspaceSettings)
        .where(WorkspaceSettings.id == 1)
        .values(name=WorkspaceSettings.name)
    )
    db.refresh(user, with_for_update=True)
    if not user.is_active or user.role != "admin" or user.token_version != current_version:
        raise HTTPException(401, "Your access changed during this request. Please sign in again.")
    member = db.query(User).filter(User.id == member_id).with_for_update().first()
    if not member:
        raise HTTPException(404, "Team member not found.")
    if member.id == user.id and (
        payload.role is not None and payload.role != user.role or payload.is_active is False
    ):
        raise HTTPException(400, "You cannot deactivate yourself or change your own role.")
    if (
        member.role == "admin"
        and member.is_active
        and (payload.role not in (None, "admin") or payload.is_active is False)
    ):
        if db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count() <= 1:
            raise HTTPException(400, "Your workspace needs at least one active administrator.")
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(400, "No changes were provided.")
    for key, value in changes.items():
        setattr(member, key, value)
    member.token_version += 1
    audit(
        db,
        user,
        "access_updated",
        member.username,
        request,
        resource_id=str(member.id),
        detail="Updated: "
        + ", ".join(f"{key}={value}" for key, value in changes.items())
        + ". Existing sessions revoked.",
    )
    db.commit()
    return serialize_user(member)


@router.post("/staff/{member_id}/password")
def reset_member_password(
    member_id: int,
    payload: AdminPasswordReset,
    request: Request,
    user: User = Depends(require("manage_staff")),
    db: Session = Depends(get_db),
):
    member = db.get(User, member_id)
    if not member:
        raise HTTPException(404, "Team member not found.")
    if member.id == user.id:
        raise HTTPException(400, "Use My profile to change your own password.")
    if member.is_demo:
        raise HTTPException(
            400, "Demo account passwords are managed automatically. Add a test team member instead."
        )
    member.password = hash_password(payload.new_password)
    member.token_version += 1
    audit(
        db,
        user,
        "password_reset",
        member.username,
        request,
        resource_id=str(member.id),
        detail="Administrator reset the account password. All previous sessions were revoked.",
    )
    db.commit()
    return {"message": "Password reset. All previous sessions for this member have been revoked."}

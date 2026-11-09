from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import PERMISSIONS, get_current_user, require
from app.config import (
    CATEGORIES,
    CLASSIFICATIONS,
    DEMO_MODE,
    DEPARTMENTS,
    MAX_UPLOAD_BYTES,
    S3_BUCKET,
)
from app.database import get_db
from app.models import AuditEvent, FileData, SecurityAlert, User, WorkspaceSettings, utcnow
from app.schemas import AlertResolution, SettingsUpdate
from app.services import audit, csv_bytes, iso, serialize_alert, serialize_event, serialize_record

router = APIRouter()


@router.get("/config")
def public_config():
    return {
        "demo_enabled": DEMO_MODE,
        "max_upload_bytes": MAX_UPLOAD_BYTES,
        "departments": DEPARTMENTS,
        "categories": CATEGORIES,
        "classifications": CLASSIFICATIONS,
    }


@router.get("/workspace")
def get_workspace(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.get(WorkspaceSettings, 1)
    return {
        "name": workspace.name,
        "contact_email": workspace.contact_email,
        "timezone": workspace.timezone,
        "session_minutes": workspace.session_minutes,
        "storage": "AWS S3" if S3_BUCKET else "Local encrypted storage",
        "encryption": "AES-256-GCM",
        "hash_algorithm": "SHA3-256",
        "demo_enabled": DEMO_MODE,
    }


@router.patch("/workspace")
def update_workspace(
    payload: SettingsUpdate,
    request: Request,
    user: User = Depends(require("manage_settings")),
    db: Session = Depends(get_db),
):
    workspace = db.get(WorkspaceSettings, 1)
    for key, value in payload.model_dump().items():
        setattr(workspace, key, str(value) if key == "contact_email" else value)
    audit(
        db,
        user,
        "settings_updated",
        "Workspace settings",
        request,
        detail="Updated workspace profile, timezone, or new-session lifetime.",
    )
    db.commit()
    return get_workspace(user, db)


def dashboard_data(db, user, days):
    now = utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)
    previous_start = start - timedelta(days=days)
    record_count = db.query(FileData).count()
    new_records = db.query(FileData).filter(FileData.created_at >= start).count()
    previous_records = (
        db.query(FileData)
        .filter(FileData.created_at >= previous_start, FileData.created_at < start)
        .count()
    )
    active_staff = db.query(User).filter(User.is_active.is_(True)).count()
    open_alerts = db.query(SecurityAlert).filter(SecurityAlert.status == "open").all()
    severity_counts = {
        severity: sum(1 for alert in open_alerts if alert.severity == severity)
        for severity in ("high", "medium", "low")
    }
    score = max(
        0,
        100 - severity_counts["high"] * 4 - severity_counts["medium"] * 2 - severity_counts["low"],
    )
    integrity_issues = db.query(FileData).filter(FileData.integrity_status != "verified").count()
    score = max(0, score - integrity_issues * 10)
    access_actions = [
        "sign_in",
        "record_downloaded",
        "record_uploaded",
        "record_viewed",
        "integrity_check",
    ]
    events_query = db.query(AuditEvent).filter(AuditEvent.action.in_(access_actions))
    if "view_audit" not in PERMISSIONS.get(user.role, []):
        events_query = events_query.filter(AuditEvent.actor_id == user.id)
    events_today = events_query.filter(
        AuditEvent.created_at >= today, AuditEvent.outcome == "success"
    ).count()
    events = events_query.filter(AuditEvent.created_at >= start).all()
    buckets = {
        (start + timedelta(days=i)).date().isoformat(): {
            "date": (start + timedelta(days=i)).date().isoformat(),
            "authorized": 0,
            "blocked": 0,
        }
        for i in range(days)
    }
    for event in events:
        key = event.created_at.date().isoformat()
        if key in buckets:
            buckets[key]["authorized" if event.outcome == "success" else "blocked"] += 1
    recent_query = db.query(AuditEvent)
    if "view_audit" not in PERMISSIONS.get(user.role, []):
        recent_query = recent_query.filter(AuditEvent.actor_id == user.id)
    recent = recent_query.order_by(AuditEvent.created_at.desc()).limit(5).all()
    return {
        "record_count": record_count,
        "new_records": new_records,
        "previous_records": previous_records,
        "active_staff": active_staff,
        "team_preview": [
            row[0]
            for row in db.query(User.username)
            .filter(User.is_active.is_(True))
            .order_by(User.id)
            .limit(2)
            .all()
        ],
        "access_today": events_today,
        "open_alerts": len(open_alerts),
        "severity_counts": severity_counts,
        "security_score": score,
        "integrity_issues": integrity_issues,
        "storage_bytes": db.query(func.coalesce(func.sum(FileData.size), 0)).scalar(),
        "chart": list(buckets.values()),
        "authorized_total": sum(point["authorized"] for point in buckets.values()),
        "blocked_total": sum(point["blocked"] for point in buckets.values()),
        "recent_records": [
            serialize_record(record)
            for record in db.query(FileData).order_by(FileData.created_at.desc()).limit(5).all()
        ],
        "recent_activity": [serialize_event(event) for event in recent],
        "as_of": iso(now),
        "days": days,
    }


@router.get("/dashboard")
def dashboard(
    days: int = Query(7, ge=7, le=90),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return dashboard_data(db, user, days)


@router.get("/reports/overview")
def export_overview(
    request: Request,
    days: int = Query(7, ge=7, le=90),
    user: User = Depends(require("view_audit")),
    db: Session = Depends(get_db),
):
    data = dashboard_data(db, user, days)
    rows = [
        ["MedGuard security overview", "Value"],
        ["Generated at (UTC)", data["as_of"]],
        ["Reporting days", days],
        ["Protected records", data["record_count"]],
        ["New records", data["new_records"]],
        ["Active team members", data["active_staff"]],
        ["Open alerts", data["open_alerts"]],
        ["Security score", data["security_score"]],
        ["Integrity issues", data["integrity_issues"]],
        ["Storage bytes (plaintext size)", data["storage_bytes"]],
        [],
        ["Date (UTC)", "Authorized access", "Blocked access"],
    ]
    rows.extend([[point["date"], point["authorized"], point["blocked"]] for point in data["chart"]])
    audit(db, user, "report_exported", "Security overview report", request)
    db.commit()
    return Response(
        csv_bytes(rows),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="medguard-security-overview.csv"'},
    )


def filtered_audit(db, q, action, outcome, days):
    query = db.query(AuditEvent).filter(AuditEvent.created_at >= utcnow() - timedelta(days=days))
    if q:
        search = f"%{q[:100]}%"
        query = query.filter(
            or_(
                AuditEvent.actor_name.ilike(search),
                AuditEvent.resource.ilike(search),
                AuditEvent.ip_address.ilike(search),
            )
        )
    if action:
        query = query.filter(AuditEvent.action == action)
    if outcome:
        query = query.filter(AuditEvent.outcome == outcome)
    return query


@router.get("/audit")
def list_audit(
    q: str = "",
    action: str = "",
    outcome: str = "",
    days: int = Query(30, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    user: User = Depends(require("view_audit")),
    db: Session = Depends(get_db),
):
    query = filtered_audit(db, q, action, outcome, days)
    return {
        "items": [
            serialize_event(event)
            for event in query.order_by(AuditEvent.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        ],
        "total": query.count(),
        "page": page,
        "page_size": page_size,
        "actions": [
            row[0]
            for row in db.query(AuditEvent.action).distinct().order_by(AuditEvent.action).all()
        ],
    }


@router.get("/audit/export")
def export_audit(
    request: Request,
    q: str = "",
    action: str = "",
    outcome: str = "",
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(require("view_audit")),
    db: Session = Depends(get_db),
):
    events = (
        filtered_audit(db, q, action, outcome, days)
        .order_by(AuditEvent.created_at.desc())
        .limit(10000)
        .all()
    )
    rows = [
        [
            "ID",
            "Timestamp (UTC)",
            "Actor",
            "Action",
            "Resource",
            "Outcome",
            "Source IP",
            "Detail",
            "Synthetic demo event",
        ]
    ]
    rows.extend(
        [
            [
                e.id,
                iso(e.created_at),
                e.actor_name,
                e.action,
                e.resource,
                e.outcome,
                e.ip_address,
                e.detail,
                e.is_demo,
            ]
            for e in events
        ]
    )
    audit(
        db,
        user,
        "report_exported",
        "Audit trail CSV",
        request,
        detail=f"Exported {len(events)} events, capped at 10,000 rows.",
    )
    db.commit()
    return Response(
        csv_bytes(rows),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="medguard-audit-trail.csv"'},
    )


@router.get("/alerts")
def list_alerts(
    status: str = "",
    severity: str = "",
    user: User = Depends(require("view_alerts")),
    db: Session = Depends(get_db),
):
    query = db.query(SecurityAlert)
    if status:
        query = query.filter(SecurityAlert.status == status)
    if severity:
        query = query.filter(SecurityAlert.severity == severity)
    items = query.order_by(SecurityAlert.created_at.desc()).all()
    return {
        "items": [serialize_alert(alert) for alert in items],
        "summary": {
            "open": db.query(SecurityAlert).filter(SecurityAlert.status == "open").count(),
            "high": db.query(SecurityAlert)
            .filter(SecurityAlert.status == "open", SecurityAlert.severity == "high")
            .count(),
            "resolved": db.query(SecurityAlert).filter(SecurityAlert.status == "resolved").count(),
        },
    }


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    payload: AlertResolution,
    request: Request,
    user: User = Depends(require("resolve_alerts")),
    db: Session = Depends(get_db),
):
    alert = db.get(SecurityAlert, alert_id)
    if not alert:
        raise HTTPException(404, "Security alert not found.")
    if alert.status == "resolved":
        raise HTTPException(409, "This alert is already resolved.")
    alert.status = "resolved"
    alert.resolved_at = utcnow()
    alert.resolved_by = user.username
    alert.resolution_note = payload.note
    audit(
        db,
        user,
        "alert_resolved",
        alert.title,
        request,
        resource_id=str(alert.id),
        detail=payload.note,
    )
    db.commit()
    return serialize_alert(alert)


@router.get("/search")
def search_workspace(
    q: str = Query("", min_length=0, max_length=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(q.strip()) < 2:
        return {"records": [], "staff": []}
    search = f"%{q.strip()}%"
    records = (
        db.query(FileData)
        .filter(or_(FileData.filename.ilike(search), FileData.patient_id.ilike(search)))
        .order_by(FileData.created_at.desc())
        .limit(5)
        .all()
    )
    staff = []
    if "manage_staff" in PERMISSIONS.get(user.role, []):
        staff = [
            {"id": member.id, "username": member.username, "department": member.department}
            for member in db.query(User)
            .filter(or_(User.username.ilike(search), User.email.ilike(search)))
            .limit(3)
            .all()
        ]
    return {"records": [serialize_record(record) for record in records], "staff": staff}

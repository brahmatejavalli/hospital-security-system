import csv
import io
import re
from datetime import datetime

from fastapi import Request
from sqlalchemy.orm import Session
from app.models import AuditEvent, FileData, SecurityAlert, User


def iso(value: datetime | None):
    return value.isoformat(timespec="seconds") + "Z" if value else None


def client_ip(request: Request) -> str:
    # Never trust arbitrary X-Forwarded-For input. Configure a trusted reverse proxy in deployment.
    return request.client.host if request.client else "unknown"


def audit(
    db: Session,
    user: User | None,
    action: str,
    resource: str,
    request: Request,
    *,
    outcome="success",
    resource_id=None,
    detail="",
):
    event = AuditEvent(
        actor_id=user.id if user else None,
        actor_name=user.username if user else "Unknown user",
        action=action,
        resource=resource[:255],
        resource_id=resource_id,
        outcome=outcome,
        ip_address=client_ip(request),
        detail=detail,
        is_demo=False,
    )
    db.add(event)
    return event


def serialize_record(record: FileData):
    return {
        "id": record.id,
        "filename": record.filename,
        "hash": record.hash_value,
        "size": record.size,
        "content_type": record.content_type,
        "patient_id": record.patient_id,
        "category": record.category,
        "department": record.department,
        "classification": record.classification,
        "uploaded_by": record.uploaded_by,
        "uploader_name": record.uploader_name,
        "integrity_status": record.integrity_status,
        "created_at": iso(record.created_at),
        "encryption": "AES-256-GCM",
    }


def serialize_event(event: AuditEvent):
    return {
        "id": event.id,
        "actor_id": event.actor_id,
        "actor_name": event.actor_name,
        "action": event.action,
        "resource": event.resource,
        "resource_id": event.resource_id,
        "outcome": event.outcome,
        "ip_address": event.ip_address,
        "detail": event.detail,
        "is_demo": event.is_demo,
        "created_at": iso(event.created_at),
    }


def serialize_alert(alert: SecurityAlert):
    return {
        "id": alert.id,
        "title": alert.title,
        "description": alert.description,
        "severity": alert.severity,
        "status": alert.status,
        "source_ip": alert.source_ip,
        "recommendation": alert.recommendation,
        "is_demo": alert.is_demo,
        "created_at": iso(alert.created_at),
        "resolved_at": iso(alert.resolved_at),
        "resolved_by": alert.resolved_by,
        "resolution_note": alert.resolution_note,
    }


def raise_security_alert(db, title, description, request, severity="medium"):
    db.add(
        SecurityAlert(
            title=title,
            description=description,
            severity=severity,
            source_ip=client_ip(request),
            recommendation="Review the related activity in the audit trail. Confirm that the account and its permissions are appropriate, and contact your workspace administrator if needed.",
        )
    )


def safe_filename(filename: str) -> str:
    name = re.split(r"[/\\]", filename)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    if not name or len(name) > 255:
        raise ValueError("Choose a file with a valid name of 255 characters or fewer.")
    return name


def csv_bytes(rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    for row in rows:
        # Prevent spreadsheet formula injection, including after whitespace.
        writer.writerow(
            [
                "'" + str(value)
                if str(value).lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
                else str(value)
                for value in row
            ]
        )
    return ("\ufeff" + stream.getvalue()).encode("utf-8")

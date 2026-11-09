from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False)
    email = Column(String(254), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    role = Column(String(20), default="nurse", nullable=False)
    department = Column(String(80), default="General Medicine", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    token_version = Column(Integer, default=0, nullable=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class FileData(Base):
    __tablename__ = "files"
    id = Column(String(36), primary_key=True)
    filename = Column(String(255), nullable=False)
    hash_value = Column(String(64), nullable=False)
    storage_key = Column(String(100), unique=True, nullable=False)
    size = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=False)
    patient_id = Column(String(40), nullable=False)
    category = Column(String(40), nullable=False)
    department = Column(String(80), nullable=False)
    classification = Column(String(20), default="Confidential", nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploader_name = Column(String(100), nullable=False)
    integrity_status = Column(String(20), default="verified", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(100), nullable=False)
    action = Column(String(40), nullable=False, index=True)
    resource = Column(String(255), nullable=False)
    resource_id = Column(String(50), nullable=True)
    outcome = Column(String(20), default="success", nullable=False)
    ip_address = Column(String(64), nullable=False)
    detail = Column(Text, default="", nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)


class SecurityAlert(Base):
    __tablename__ = "security_alerts"
    id = Column(Integer, primary_key=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)
    status = Column(String(20), default="open", nullable=False, index=True)
    source_ip = Column(String(64), nullable=False)
    recommendation = Column(Text, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(String(100), nullable=True)
    resolution_note = Column(Text, nullable=True)


class WorkspaceSettings(Base):
    __tablename__ = "workspace_settings"
    id = Column(Integer, primary_key=True, default=1)
    name = Column(String(100), default="Greenfield Medical", nullable=False)
    contact_email = Column(String(254), default="security@greenfield.example", nullable=False)
    timezone = Column(String(80), default="Asia/Kolkata", nullable=False)
    session_minutes = Column(Integer, default=60, nullable=False)

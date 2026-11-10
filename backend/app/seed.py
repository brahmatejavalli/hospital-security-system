"""Deterministic, explicitly synthetic sample records. Never run in production."""

import secrets
from datetime import timedelta
from uuid import uuid4

from app import s3_service as storage
from app.auth import hash_password
from app.config import DEMO_MODE
from app.encryption import encrypt_data, generate_sha3
from app.models import AuditEvent, FileData, SecurityAlert, User, WorkspaceSettings, utcnow


def sample_pdf(title: str, patient_id: str, department: str) -> bytes:
    lines = [
        "GREENFIELD MEDICAL | DEMO RECORD",
        "",
        title,
        f"Patient reference: {patient_id}",
        f"Department: {department}",
        "",
        "SYNTHETIC DATA - NOT A REAL PATIENT RECORD",
        "This file demonstrates MedGuard encrypted storage.",
        "No clinical decisions should be made from this sample.",
    ]
    commands = "BT /F1 12 Tf 50 780 Td 18 TL "
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands += f"({escaped}) Tj T* "
    commands += "ET"
    stream = commands.encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    output = b"%PDF-1.4\n"
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    output += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    output += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return output


def initialize_workspace(db):
    if not db.get(WorkspaceSettings, 1):
        db.add(WorkspaceSettings(id=1))
        db.commit()
    if not DEMO_MODE or db.query(User).first():
        return
    now = utcnow()
    password = hash_password(secrets.token_urlsafe(32))
    people = [
        ("Dr. Ananya Rao", "ananya.rao", "admin", "Administration"),
        ("Dr. Arjun Mehta", "arjun.mehta", "doctor", "Cardiology"),
        ("Dr. Sarah Wilson", "sarah.wilson", "doctor", "Radiology"),
        ("Priya Sharma", "priya.sharma", "nurse", "General Medicine"),
        ("Dr. Rohan Patel", "rohan.patel", "doctor", "Neurology"),
        ("Emily Chen", "emily.chen", "nurse", "Emergency"),
        ("Vikram Desai", "vikram.desai", "auditor", "Administration"),
        ("Dr. Neha Kapoor", "neha.kapoor", "doctor", "Pediatrics"),
        ("Aisha Khan", "aisha.khan", "nurse", "Cardiology"),
        ("Michael Davis", "michael.davis", "admin", "Administration"),
        ("Dr. Kabir Singh", "kabir.singh", "doctor", "Orthopedics"),
        ("Sofia Martin", "sofia.martin", "nurse", "Pediatrics"),
    ]
    users = []
    for index, (name, email, role, department) in enumerate(people):
        member = User(
            username=name,
            email=f"{email}@greenfield.example",
            password=password,
            role=role,
            department=department,
            is_demo=True,
            is_active=index != 11,
            last_login=now - timedelta(minutes=8 + index * 23),
            created_at=now - timedelta(days=90 - index * 6),
        )
        db.add(member)
        users.append(member)
    db.flush()
    templates = [
        ("Blood panel results", "Lab report", "General Medicine"),
        ("Cardiac assessment", "Clinical notes", "Cardiology"),
        ("MRI scan report", "Imaging", "Radiology"),
        ("Discharge summary", "Discharge summary", "Emergency"),
        ("Patient care notes", "Clinical notes", "Pediatrics"),
        ("Medication plan", "Prescription", "Neurology"),
        ("Pre-operative assessment", "Clinical notes", "Orthopedics"),
        ("Laboratory analysis", "Lab report", "General Medicine"),
    ]
    records = []
    for index in range(128):
        title, category, department = templates[index % len(templates)]
        patient_id = f"GF-2026-{1048 + index}"
        record_id = str(uuid4())
        content = sample_pdf(title, patient_id, department)
        key = f"records/{record_id}.bin"
        storage.put_object(key, encrypt_data(content, record_id))
        owner = users[1 + index % 5]
        created = (
            now - timedelta(minutes=12 + index * 25)
            if index < 6
            else now - timedelta(days=1 + index // 3, hours=index % 10)
        )
        record = FileData(
            id=record_id,
            filename=f"{title.lower().replace(' ', '-')}-{patient_id}.pdf",
            hash_value=generate_sha3(content),
            storage_key=key,
            size=len(content),
            content_type="application/pdf",
            patient_id=patient_id,
            category=category,
            department=department,
            classification="Restricted"
            if index % 7 == 0
            else "Internal"
            if index % 9 == 0
            else "Confidential",
            uploaded_by=owner.id,
            uploader_name=owner.username,
            created_at=created,
        )
        db.add(record)
        records.append(record)
    counts = [42, 35, 48, 27, 39, 31, 45, 54, 44, 62, 48, 69, 56, 52]
    for day in range(14):
        count = counts[day]
        for index in range(count):
            actor = users[1 + index % 8]
            record = records[(index + day) % len(records)]
            time = (
                now - timedelta(minutes=5 + index * 9)
                if day == 0
                else (now - timedelta(days=day)).replace(
                    hour=7 + index % 12, minute=(index * 13) % 60
                )
            )
            blocked = index == 8 and day in (0, 2, 5)
            db.add(
                AuditEvent(
                    actor_id=actor.id,
                    actor_name=actor.username,
                    action="record_downloaded"
                    if index % 3 == 0
                    else "record_uploaded"
                    if index % 9 == 1
                    else "record_viewed",
                    resource=record.filename,
                    resource_id=record.id,
                    outcome="blocked" if blocked else "success",
                    ip_address=f"10.24.8.{20 + index % 30}",
                    detail="Synthetic demonstration event; no real patient data.",
                    is_demo=True,
                    created_at=time,
                )
            )
    for index, (title, description, severity, recommendation) in enumerate(
        [
            (
                "Multiple failed sign-in attempts",
                "Five unsuccessful sign-in attempts were detected for a staff account within a short period. The account was protected by sign-in rate limiting.",
                "high",
                "Confirm the staff member recognizes this activity. Review the source address and revoke sessions if the activity is unexpected.",
            ),
            (
                "Restricted record access blocked",
                "A nursing account attempted to download a restricted record. The role-based access policy blocked the download.",
                "medium",
                "Check whether the team member needs an approved role change. Review the related audit events before granting additional access.",
            ),
            (
                "After-hours access needs review",
                "A sample access pattern outside standard hospital office hours was flagged for administrator review. This is a demonstration alert, not a live anomaly detector.",
                "low",
                "Confirm that the access was expected, such as an on-call shift. Record your findings when resolving the alert.",
            ),
            (
                "Staff permission change reviewed",
                "An administrator reviewed a sample role change and confirmed it was authorized.",
                "low",
                "No further action is required.",
            ),
            (
                "Sign-in activity verified",
                "A sample sign-in event was reviewed and confirmed by the account owner.",
                "medium",
                "No further action is required.",
            ),
        ]
    ):
        resolved = index > 2
        db.add(
            SecurityAlert(
                title=title,
                description=description,
                severity=severity,
                source_ip=f"10.24.8.{42 + index}",
                recommendation=recommendation,
                is_demo=True,
                status="resolved" if resolved else "open",
                created_at=now - timedelta(minutes=25 + index * 55)
                if not resolved
                else now - timedelta(days=index),
                resolved_at=now - timedelta(days=index - 1) if resolved else None,
                resolved_by=users[0].username if resolved else None,
                resolution_note="Verified with the account owner. Activity was authorized."
                if resolved
                else None,
            )
        )
    db.commit()

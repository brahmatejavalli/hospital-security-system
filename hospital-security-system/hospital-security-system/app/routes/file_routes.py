import logging
import re
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import s3_service as storage
from app.auth import get_current_user, require
from app.config import CATEGORIES, CLASSIFICATIONS, DEPARTMENTS, MAX_UPLOAD_BYTES
from app.database import get_db
from app.encryption import decrypt_data, encrypt_data, generate_sha3
from app.models import FileData, User
from app.services import audit, raise_security_alert, safe_filename, serialize_record

router = APIRouter()
logger = logging.getLogger(__name__)


def validate_file(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.lower()
    if extension == ".pdf" and content.startswith(b"%PDF-"):
        return "application/pdf"
    if extension == ".png" and content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if extension in (".jpg", ".jpeg") and content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if extension in (".txt", ".csv"):
        try:
            content.decode("utf-8-sig")
            if b"\x00" not in content:
                return "text/csv" if extension == ".csv" else "text/plain"
        except UnicodeDecodeError:
            pass
    raise HTTPException(
        415,
        "Use a valid PDF, PNG, JPG, UTF-8 CSV, or text file. The file content must match its extension.",
    )


@router.get("/records")
def list_records(
    q: str = Query("", max_length=100),
    department: str = "",
    classification: str = "",
    category: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort: str = "newest",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(FileData)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                FileData.filename.ilike(search),
                FileData.patient_id.ilike(search),
                FileData.uploader_name.ilike(search),
            )
        )
    if department:
        query = query.filter(FileData.department == department)
    if classification:
        query = query.filter(FileData.classification == classification)
    if category:
        query = query.filter(FileData.category == category)
    total = query.count()
    ordering = (
        FileData.filename.asc()
        if sort == "name"
        else FileData.created_at.asc()
        if sort == "oldest"
        else FileData.created_at.desc()
    )
    records = query.order_by(ordering).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [serialize_record(record) for record in records],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/records", status_code=201)
def upload_file(
    request: Request,
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    category: str = Form("Other"),
    department: str = Form("General Medicine"),
    classification: str = Form("Confidential"),
    user: User = Depends(require("upload")),
    db: Session = Depends(get_db),
):
    if (
        department not in DEPARTMENTS
        or category not in CATEGORIES
        or classification not in CLASSIFICATIONS
    ):
        raise HTTPException(422, "Choose a valid department, record type, and classification.")
    patient_id = patient_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9\-_/]{1,39}", patient_id):
        raise HTTPException(
            422, "Patient ID must be 2–40 letters, numbers, dashes, underscores, or slashes."
        )
    if user.role == "nurse" and classification == "Restricted":
        raise HTTPException(403, "Only doctors and administrators can upload restricted records.")
    try:
        filename = safe_filename(file.filename or "")
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(422, "This file is empty. Choose a file with content.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "The maximum file size is 10 MB.")
    content_type = validate_file(filename, content)
    record_id = str(uuid4())
    key = f"records/{record_id}.bin"
    payload = encrypt_data(content, record_id)
    try:
        storage.put_object(key, payload)
    except Exception:
        logger.exception("Encrypted storage write failed")
        raise HTTPException(503, "Secure storage is temporarily unavailable. Please try again.")
    record = FileData(
        id=record_id,
        filename=filename,
        hash_value=generate_sha3(content),
        storage_key=key,
        size=len(content),
        content_type=content_type,
        patient_id=patient_id,
        category=category,
        department=department,
        classification=classification,
        uploaded_by=user.id,
        uploader_name=user.username,
    )
    try:
        db.add(record)
        audit(
            db,
            user,
            "record_uploaded",
            filename,
            request,
            resource_id=record_id,
            detail=f"Encrypted with AES-256-GCM; classified {classification}.",
        )
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete_object(key)
        except Exception:
            logger.exception("Orphaned encrypted object cleanup failed")
        raise
    return serialize_record(record)


@router.get("/records/{record_id}")
def get_record(
    record_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.get(FileData, record_id)
    if not record:
        raise HTTPException(404, "Record not found.")
    audit(
        db,
        user,
        "record_viewed",
        record.filename,
        request,
        resource_id=record_id,
        detail="Record metadata retrieved. No file contents returned.",
    )
    db.commit()
    return serialize_record(record)


@router.get("/records/{record_id}/download")
def download_file(
    record_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.get(FileData, record_id)
    if not record:
        raise HTTPException(404, "Record not found.")
    if user.role == "auditor" or user.role == "nurse" and record.classification == "Restricted":
        audit(
            db,
            user,
            "record_downloaded",
            record.filename,
            request,
            outcome="blocked",
            resource_id=record_id,
            detail="Record policy denied content access.",
        )
        raise_security_alert(
            db,
            "Restricted record access blocked",
            f"{user.username} attempted to download a record outside their role permissions. Access was blocked.",
            request,
        )
        db.commit()
        raise HTTPException(403, "Your role cannot download this record. Contact an administrator.")
    try:
        payload = storage.get_object(record.storage_key)
    except FileNotFoundError:
        raise HTTPException(503, "The encrypted file is unavailable. Contact your administrator.")
    except Exception:
        logger.exception("Encrypted storage read failed")
        raise HTTPException(503, "Secure storage is temporarily unavailable.")
    try:
        content = decrypt_data(payload, record.id, record.hash_value)
    except (InvalidTag, ValueError):
        record.integrity_status = "needs_review"
        audit(
            db,
            user,
            "integrity_check",
            record.filename,
            request,
            outcome="blocked",
            resource_id=record_id,
            detail="Authenticated decryption or SHA3-256 verification failed. Download blocked.",
        )
        raise_security_alert(
            db,
            "Record integrity check failed",
            "An encrypted record did not pass authenticated decryption and checksum verification. The download was blocked to protect the original data.",
            request,
            "high",
        )
        db.commit()
        raise HTTPException(
            409,
            "Integrity verification failed. Download blocked; an administrator has been alerted.",
        )
    record.integrity_status = "verified"
    audit(
        db,
        user,
        "record_downloaded",
        record.filename,
        request,
        resource_id=record_id,
        detail="AES-GCM authentication and SHA3-256 checksum verified.",
    )
    db.commit()
    return Response(
        content,
        media_type=record.content_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(record.filename, safe='')}",
            "X-Content-SHA3-256": record.hash_value,
        },
    )


@router.delete("/records/{record_id}")
def delete_file(
    record_id: str,
    request: Request,
    user: User = Depends(require("delete")),
    db: Session = Depends(get_db),
):
    record = db.get(FileData, record_id)
    if not record:
        raise HTTPException(404, "Record not found.")
    try:
        storage.delete_object(record.storage_key)
    except Exception:
        logger.exception("Encrypted object deletion failed")
        raise HTTPException(503, "The encrypted file could not be removed. Please try again.")
    audit(
        db,
        user,
        "record_deleted",
        record.filename,
        request,
        resource_id=record_id,
        detail="Record and encrypted object removed; audit history retained.",
    )
    db.delete(record)
    db.commit()
    return {"message": "Record and encrypted file deleted. Its audit history is retained."}

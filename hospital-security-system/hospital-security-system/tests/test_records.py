import pytest
from cryptography.exceptions import InvalidTag

from app import s3_service as storage
from app.config import MAX_UPLOAD_BYTES
from app.database import SessionLocal
from app.encryption import decrypt_data, encrypt_data, generate_sha3
from app.models import AuditEvent, FileData, SecurityAlert
from app.services import safe_filename


def test_upload_encrypted_at_rest_download_exact_bytes_and_delete(admin, upload):
    content = b"Synthetic sample: confidential clinical details."
    record = upload(content=content)
    with SessionLocal() as db:
        stored = db.get(FileData, record["id"])
        encrypted = storage.get_object(stored.storage_key)
        assert encrypted.startswith(b"MG01")
        assert content not in encrypted
        assert stored.hash_value == generate_sha3(content)
    response = admin.get(f"/api/records/{record['id']}/download")
    assert response.status_code == 200 and response.content == content
    assert response.headers["X-Content-SHA3-256"] == generate_sha3(content)
    assert "attachment" in response.headers["Content-Disposition"]
    assert admin.delete(f"/api/records/{record['id']}").status_code == 200
    assert admin.get(f"/api/records/{record['id']}").status_code == 404
    with SessionLocal() as db:
        assert db.query(AuditEvent).filter(AuditEvent.resource_id == record["id"]).count() == 3
    with pytest.raises(FileNotFoundError):
        storage.get_object(stored.storage_key)


def test_authenticated_encryption_binds_record_and_rejects_tampering():
    data = b"sample"
    checksum = generate_sha3(data)
    first, second = encrypt_data(data, "record-a"), encrypt_data(data, "record-a")
    assert first != second
    assert decrypt_data(first, "record-a", checksum) == data
    with pytest.raises(InvalidTag):
        decrypt_data(first, "record-b", checksum)
    with pytest.raises(ValueError):
        decrypt_data(first, "record-a", "0" * 64)
    with pytest.raises(ValueError):
        decrypt_data(b"invalid", "record-a", checksum)


def test_tampered_file_blocked_and_alerted(admin, upload):
    record = upload()
    with SessionLocal() as db:
        stored = db.get(FileData, record["id"])
        path = storage.local_path(stored.storage_key)
        payload = bytearray(path.read_bytes())
        payload[-1] ^= 1
        path.write_bytes(payload)
    assert admin.get(f"/api/records/{record['id']}/download").status_code == 409
    with SessionLocal() as db:
        assert db.get(FileData, record["id"]).integrity_status == "needs_review"
        assert db.query(SecurityAlert).filter(SecurityAlert.severity == "high").count() == 1
        assert (
            db.query(AuditEvent).filter(AuditEvent.action == "integrity_check").first().outcome
            == "blocked"
        )


def test_nurse_restricted_policy_and_auditor_metadata_only(upload, as_user):
    restricted = upload(classification="Restricted")
    confidential = upload()
    nurse = as_user("nurse")
    assert nurse.get(f"/api/records/{restricted['id']}").status_code == 200
    assert nurse.get(f"/api/records/{restricted['id']}/download").status_code == 403
    assert nurse.get(f"/api/records/{confidential['id']}/download").status_code == 200
    assert nurse.delete(f"/api/records/{confidential['id']}").status_code == 403
    auditor = as_user("auditor")
    assert auditor.get("/api/records").status_code == 200
    assert auditor.get(f"/api/records/{confidential['id']}/download").status_code == 403
    assert (
        auditor.post(
            "/api/records", files={"file": ("sample.txt", b"test")}, data={"patient_id": "TEST-2"}
        ).status_code
        == 403
    )


def test_doctor_can_download_restricted_but_not_delete(upload, as_user):
    record = upload(classification="Restricted")
    client = as_user("doctor")
    assert client.get(f"/api/records/{record['id']}/download").status_code == 200
    assert client.delete(f"/api/records/{record['id']}").status_code == 403


@pytest.mark.parametrize(
    "filename,content,status",
    [
        ("malware.exe", b"MZfake", 415),
        ("fake.pdf", b"not a PDF", 415),
        ("fake.png", b"not an image", 415),
        ("bad.txt", b"\x00\xff\xff", 415),
        ("empty.txt", b"", 422),
    ],
)
def test_file_validation(admin, filename, content, status):
    response = admin.post(
        "/api/records", files={"file": (filename, content)}, data={"patient_id": "TEST-1"}
    )
    assert response.status_code == status


def test_invalid_metadata_and_nurse_cannot_upload_restricted(admin, as_user):
    assert (
        admin.post(
            "/api/records", files={"file": ("test.txt", b"test")}, data={"patient_id": "A"}
        ).status_code
        == 422
    )
    assert (
        admin.post(
            "/api/records",
            files={"file": ("test.txt", b"test")},
            data={"patient_id": "TEST-1", "department": "Unknown"},
        ).status_code
        == 422
    )
    nurse = as_user("nurse")
    assert (
        nurse.post(
            "/api/records",
            files={"file": ("test.txt", b"test")},
            data={"patient_id": "TEST-1", "classification": "Restricted"},
        ).status_code
        == 403
    )


def test_oversized_file_and_request_early_limit(admin):
    assert (
        admin.post(
            "/api/records",
            files={"file": ("test.txt", b"x" * (MAX_UPLOAD_BYTES + 1))},
            data={"patient_id": "TEST-1"},
        ).status_code
        == 413
    )
    response = admin.post(
        "/api/records", content=b"x", headers={"Content-Length": str(MAX_UPLOAD_BYTES + 100_000)}
    )
    assert response.status_code == 413
    # The limit also counts chunked request bodies that omit Content-Length.
    response = admin.post(
        "/api/auth/login",
        content=iter([b"x" * (MAX_UPLOAD_BYTES + 100_000)]),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_filename_and_storage_path_traversal(admin, upload):
    record = upload(filename="../../private.txt")
    assert record["filename"] == "private.txt"
    assert safe_filename(r"C:\fakepath\sample.txt") == "sample.txt"
    with pytest.raises(ValueError):
        storage.local_path("../../private.txt")
    with pytest.raises(ValueError):
        safe_filename("\x00..")


def test_list_search_filters_sort_and_pagination(admin, upload):
    upload(filename="alpha.txt")
    upload(filename="beta.txt", classification="Restricted")
    assert admin.get("/api/records?q=alpha").json()["total"] == 1
    assert admin.get("/api/records?classification=Restricted").json()["total"] == 1
    assert (
        admin.get("/api/records?sort=name&page_size=1").json()["items"][0]["filename"]
        == "alpha.txt"
    )
    assert (
        admin.get("/api/records?page_size=1&page=2").json()["items"][0]["filename"] == "alpha.txt"
    )
    assert admin.get("/api/records?page=0").status_code == 422
    assert admin.get("/api/records?page_size=1000").status_code == 422


def test_storage_failure_does_not_create_record(admin, monkeypatch):
    def unavailable(*args):
        raise OSError("Simulated storage outage")

    monkeypatch.setattr(storage, "put_object", unavailable)
    response = admin.post(
        "/api/records", files={"file": ("test.txt", b"sample")}, data={"patient_id": "TEST-1"}
    )
    assert response.status_code == 503
    assert admin.get("/api/records").json()["total"] == 0


def test_legacy_upload_requires_authentication(client):
    response = client.post(
        "/file/upload",
        headers={"X-Requested-With": "MedGuard"},
        files={"file": ("test.txt", b"sample")},
        data={"patient_id": "TEST-1"},
    )
    assert response.status_code == 401

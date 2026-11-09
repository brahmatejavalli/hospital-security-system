from app.auth import create_access_token
from app.database import SessionLocal
from app.models import AuditEvent, SecurityAlert, User
from app.services import csv_bytes
from conftest import PASSWORD


def test_create_member_duplicate_and_validation(admin):
    payload = {
        "username": "New Nurse",
        "email": "new@hospital.example",
        "password": PASSWORD,
        "role": "nurse",
        "department": "Emergency",
    }
    response = admin.post("/api/staff", json=payload)
    assert response.status_code == 201
    assert response.json()["role"] == "nurse"
    assert "password" not in response.json()
    assert admin.post("/api/staff", json=payload).status_code == 409
    assert admin.post("/api/staff", json={**payload, "password": "short"}).status_code == 422
    assert admin.post("/api/staff", json={**payload, "role": "superadmin"}).status_code == 422
    assert admin.post("/api/staff", json={**payload, "department": "Unknown"}).status_code == 422
    assert admin.post("/api/staff", json={**payload, "email": "invalid"}).status_code == 422


def test_role_change_and_deactivation_revoke_sessions(admin, users):
    old_token = create_access_token(users["nurse"])
    response = admin.patch(f"/api/staff/{users['nurse'].id}", json={"role": "doctor"})
    assert response.status_code == 200 and response.json()["role"] == "doctor"
    assert (
        admin.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code
        == 401
    )
    with SessionLocal() as db:
        new_token = create_access_token(db.get(User, users["nurse"].id))
    assert (
        admin.patch(f"/api/staff/{users['nurse'].id}", json={"is_active": False}).status_code == 200
    )
    assert (
        admin.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code
        == 401
    )
    assert (
        admin.post(
            "/api/auth/login", json={"email": "nurse@hospital.example", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_admin_cannot_remove_own_access_or_last_admin(admin, users):
    assert admin.patch(f"/api/staff/{users['admin'].id}", json={"role": "nurse"}).status_code == 400
    assert (
        admin.patch(f"/api/staff/{users['admin'].id}", json={"is_active": False}).status_code == 400
    )
    assert admin.patch("/api/staff/98765", json={"role": "nurse"}).status_code == 404
    assert admin.patch(f"/api/staff/{users['nurse'].id}", json={}).status_code == 400


def test_staff_filters(admin):
    assert admin.get("/api/staff?role=doctor").json()["total"] == 1
    assert admin.get("/api/staff?q=nurse").json()["total"] == 1
    assert admin.get("/api/staff?status=inactive").json()["total"] == 0


def test_staff_and_settings_admin_only(as_user):
    for role in ("doctor", "nurse", "auditor"):
        client = as_user(role)
        assert client.get("/api/staff").status_code == 403
        assert (
            client.post(
                "/api/staff",
                json={
                    "username": "New Person",
                    "email": "new@hospital.example",
                    "password": PASSWORD,
                },
            ).status_code
            == 403
        )
        assert (
            client.patch(
                "/api/workspace",
                json={
                    "name": "Hospital",
                    "contact_email": "it@hospital.example",
                    "timezone": "UTC",
                    "session_minutes": 30,
                },
            ).status_code
            == 403
        )
    with SessionLocal() as db:
        assert db.query(AuditEvent).filter(AuditEvent.action == "permission_denied").count() == 9


def test_dashboard_counts_search_and_report(admin, upload):
    record = upload(filename="synthetic-test.txt")
    data = admin.get("/api/dashboard?days=7").json()
    assert data["record_count"] == 1
    assert data["active_staff"] == 4
    assert data["security_score"] == 100
    assert len(data["chart"]) == 7
    assert data["storage_bytes"] == record["size"]
    assert admin.get("/api/search?q=synthetic").json()["records"][0]["id"] == record["id"]
    assert admin.get("/api/search?q=Nurse").json()["staff"][0]["username"] == "Test Nurse"
    assert admin.get("/api/search?q=a").json() == {"records": [], "staff": []}
    report = admin.get("/api/reports/overview?days=30")
    assert report.status_code == 200 and "Protected records" in report.text


def test_settings_validation_timezone_and_session_lifetime(admin):
    payload = {
        "name": "Test Medical Center",
        "contact_email": "it@hospital.example",
        "timezone": "UTC",
        "session_minutes": 30,
    }
    assert admin.patch("/api/workspace", json=payload).status_code == 200
    assert admin.get("/api/workspace").json()["name"] == "Test Medical Center"
    assert (
        admin.patch("/api/workspace", json={**payload, "timezone": "Not/A_Timezone"}).status_code
        == 422
    )
    assert (
        admin.patch("/api/workspace", json={**payload, "session_minutes": 9999}).status_code == 422
    )
    response = admin.post(
        "/api/auth/login", json={"email": "admin@hospital.example", "password": PASSWORD}
    )
    assert "Max-Age=1800" in response.headers["set-cookie"]


def test_alert_resolution_score_and_audit_history(admin):
    with SessionLocal() as db:
        alert = SecurityAlert(
            title="A test alert",
            description="A synthetic test",
            severity="high",
            source_ip="192.0.2.10",
            recommendation="Review the sample event.",
        )
        db.add(alert)
        db.commit()
        alert_id = alert.id
    assert admin.get("/api/dashboard").json()["security_score"] == 96
    assert admin.get("/api/alerts?status=open").json()["summary"]["open"] == 1
    assert (
        admin.post(
            f"/api/alerts/{alert_id}/resolve",
            json={"note": "Reviewed test activity and confirmed authorization."},
        ).status_code
        == 200
    )
    assert (
        admin.post(
            f"/api/alerts/{alert_id}/resolve", json={"note": "Repeat resolution"}
        ).status_code
        == 409
    )
    assert admin.get("/api/dashboard").json()["security_score"] == 100
    with SessionLocal() as db:
        assert db.query(AuditEvent).filter(AuditEvent.action == "alert_resolved").count() == 1
        assert db.get(SecurityAlert, alert_id).resolved_by == "Test Admin"


def test_audit_role_boundaries_filters_and_csv(admin, upload, as_user):
    upload()
    assert admin.get("/api/audit?action=record_uploaded").json()["total"] == 1
    report = admin.get("/api/audit/export?action=record_uploaded")
    assert report.status_code == 200 and "record_uploaded" in report.text
    auditor = as_user("auditor")
    assert auditor.get("/api/audit").status_code == 200
    assert auditor.get("/api/alerts").status_code == 200
    assert auditor.post("/api/alerts/1/resolve", json={"note": "Test review"}).status_code == 403
    nurse = as_user("nurse")
    assert nurse.get("/api/audit").status_code == 403
    assert nurse.get("/api/alerts").status_code == 403
    assert nurse.get("/api/reports/overview").status_code == 403
    assert nurse.get("/api/search?q=Test").json()["staff"] == []


def test_csv_export_prevents_spreadsheet_formula_injection():
    output = csv_bytes(
        [['=HYPERLINK("evil")', "+CMD", "-1+1", "@SUM(1)", "  =1+1", "safe, text"]]
    ).decode("utf-8-sig")
    assert "'=HYPERLINK" in output
    assert "'+CMD" in output
    assert "'-1+1" in output
    assert "'@SUM" in output
    assert "'  =1+1" in output
    assert '"safe, text"' in output


def test_legacy_registration_is_not_public(client):
    response = client.post(
        "/user/register",
        headers={"X-Requested-With": "MedGuard"},
        json={"username": "New Person", "email": "new@hospital.example", "password": PASSWORD},
    )
    assert response.status_code == 401


def test_admin_password_reset_revokes_sessions_and_restores_signin(admin, users):
    previous_token = create_access_token(users["nurse"])
    response = admin.post(
        f"/api/staff/{users['nurse'].id}/password",
        json={"new_password": "ResetAccount!2026"},
    )
    assert response.status_code == 200
    assert (
        admin.get("/api/auth/me", headers={"Authorization": f"Bearer {previous_token}"}).status_code
        == 401
    )
    assert (
        admin.post(
            "/api/auth/login",
            json={"email": "nurse@hospital.example", "password": "ResetAccount!2026"},
        ).status_code
        == 200
    )
    with SessionLocal() as db:
        assert db.query(AuditEvent).filter(AuditEvent.action == "password_reset").count() == 1


def test_password_reset_boundaries(admin, users, as_user):
    assert (
        admin.post(
            f"/api/staff/{users['admin'].id}/password",
            json={"new_password": "ResetAccount!2026"},
        ).status_code
        == 400
    )
    assert (
        admin.post(
            f"/api/staff/{users['nurse'].id}/password", json={"new_password": "short"}
        ).status_code
        == 422
    )
    with SessionLocal() as db:
        member = db.get(User, users["doctor"].id)
        member.is_demo = True
        db.commit()
    assert (
        admin.post(
            f"/api/staff/{users['doctor'].id}/password",
            json={"new_password": "ResetAccount!2026"},
        ).status_code
        == 400
    )
    nurse = as_user("nurse")
    assert (
        nurse.post(
            f"/api/staff/{users['doctor'].id}/password",
            json={"new_password": "ResetAccount!2026"},
        ).status_code
        == 403
    )


def test_concurrent_admin_deactivation_keeps_an_active_administrator(admin, users):
    from concurrent.futures import ThreadPoolExecutor
    import threading

    from conftest import PASSWORD_HASH

    with SessionLocal() as db:
        other = User(
            username="Second Admin",
            email="second@hospital.example",
            password=PASSWORD_HASH,
            role="admin",
            department="Administration",
        )
        db.add(other)
        db.commit()
        other_id = other.id
        other_token = create_access_token(other)
    first_id = users["admin"].id
    first_token = create_access_token(users["admin"])
    barrier = threading.Barrier(2)

    def deactivate(target, token):
        barrier.wait()
        return admin.patch(
            f"/api/staff/{target}",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {token}"},
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(deactivate, other_id, first_token)
        second = executor.submit(deactivate, first_id, other_token)
        results = [first.result(), second.result()]
    assert results.count(200) == 1
    assert results.count(401) == 1
    with SessionLocal() as db:
        assert db.query(User).filter(User.role == "admin", User.is_active.is_(True)).count() == 1

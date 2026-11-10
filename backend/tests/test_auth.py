import jwt
import pytest

from app.auth import create_access_token, hash_password, verify_password
from app.config import SECRET_KEY
from app.database import SessionLocal
from app.models import AuditEvent, SecurityAlert
from conftest import PASSWORD


@pytest.mark.parametrize(
    "path",
    [
        "/api/records",
        "/api/staff",
        "/api/audit",
        "/api/alerts",
        "/api/dashboard",
        "/api/workspace",
        "/api/search?q=test",
    ],
)
def test_authentication_required(client, path):
    assert client.get(path).status_code == 401


def test_public_health_config_and_disabled_demo(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/config").json()["demo_enabled"] is False
    assert (
        client.post("/api/auth/demo", headers={"X-Requested-With": "MedGuard"}).status_code == 404
    )


def test_login_and_httponly_cookie(client, users):
    response = client.post(
        "/api/auth/login",
        json={"email": "ADMIN@hospital.example", "password": PASSWORD},
        headers={"X-Requested-With": "MedGuard"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"
    assert response.json()["token_type"] == "bearer"
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "password" not in response.json()["user"]
    assert client.get("/api/auth/me").status_code == 200
    # A JWT is not accepted without its required issuer/audience/version claims.
    invalid = jwt.encode({"sub": "1"}, SECRET_KEY, algorithm="HS256")
    assert (
        client.get("/api/auth/me", headers={"Authorization": f"Bearer {invalid}"}).status_code
        == 401
    )


def test_wrong_password_and_unknown_email_are_indistinguishable(client, users):
    headers = {"X-Requested-With": "MedGuard"}
    first = client.post(
        "/api/auth/login",
        headers=headers,
        json={"email": "admin@hospital.example", "password": "wrong"},
    )
    second = client.post(
        "/api/auth/login",
        headers=headers,
        json={"email": "unknown@hospital.example", "password": "wrong"},
    )
    assert first.status_code == second.status_code == 401
    assert first.json() == second.json()


def test_cross_site_mutations_rejected(client, users):
    payload = {"email": "admin@hospital.example", "password": PASSWORD}
    assert client.post("/api/auth/login", json=payload).status_code == 403
    assert (
        client.post(
            "/api/auth/login",
            json=payload,
            headers={"Origin": "https://evil.example", "X-Requested-With": "MedGuard"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/auth/login", json=payload, headers={"Origin": "http://testserver"}
        ).status_code
        == 200
    )


def test_logout_revokes_even_copied_bearer_token(admin, users):
    copied = create_access_token(users["admin"])
    response = admin.post("/api/auth/logout")
    assert response.status_code == 200
    assert (
        admin.get("/api/auth/me", headers={"Authorization": f"Bearer {copied}"}).status_code == 401
    )


def test_rate_limit_and_failed_login_alert(client, users):
    for _ in range(10):
        response = client.post(
            "/api/auth/login",
            headers={"X-Requested-With": "MedGuard"},
            json={"email": "admin@hospital.example", "password": "invalid"},
        )
        assert response.status_code == 401
    response = client.post(
        "/api/auth/login",
        headers={"X-Requested-With": "MedGuard"},
        json={"email": "admin@hospital.example", "password": "invalid"},
    )
    assert response.status_code == 429 and response.headers["Retry-After"] == "900"
    with SessionLocal() as db:
        assert db.query(SecurityAlert).count() == 1
        assert db.query(AuditEvent).filter(AuditEvent.outcome == "blocked").count() == 10


def test_password_hashing_salts_and_verification():
    one, two = hash_password(PASSWORD), hash_password(PASSWORD)
    assert one != two
    assert verify_password(PASSWORD, one)
    assert not verify_password("incorrect", one)
    assert not verify_password(PASSWORD, "corrupt hash")


def test_password_change_revokes_old_session_and_keeps_new_one(admin, users):
    old = create_access_token(users["admin"])
    response = admin.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "MyReplacement!2026"},
    )
    assert response.status_code == 200
    assert admin.get("/api/auth/me").status_code == 200
    assert admin.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401
    response = admin.post(
        "/api/auth/login",
        json={"email": "admin@hospital.example", "password": "MyReplacement!2026"},
    )
    assert response.status_code == 200


def test_password_change_rejects_weak_or_wrong_current_password(admin):
    assert (
        admin.post(
            "/api/auth/password", json={"current_password": PASSWORD, "new_password": "short"}
        ).status_code
        == 422
    )
    assert (
        admin.post(
            "/api/auth/password",
            json={"current_password": "wrong", "new_password": "NewPassword!2026"},
        ).status_code
        == 400
    )
    assert (
        admin.post(
            "/api/auth/password", json={"current_password": PASSWORD, "new_password": PASSWORD}
        ).status_code
        == 400
    )


def test_profile_validation_and_update(admin):
    assert (
        admin.patch("/api/auth/profile", json={"username": "Dr. Test Person"}).json()["username"]
        == "Dr. Test Person"
    )
    assert admin.patch("/api/auth/profile", json={"username": " "}).status_code == 422


def test_security_headers_and_unknown_api(client):
    response = client.get("/api/config")
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert client.get("/api/not-an-endpoint").status_code == 404


def test_password_whitespace_is_preserved_and_bearer_scheme_is_case_insensitive(admin, users):
    password = "  WhitespacePassword2026  "
    created = admin.post(
        "/api/staff",
        json={"username": "Space Test", "email": "space@hospital.example", "password": password},
    )
    assert created.status_code == 201
    login = admin.post(
        "/api/auth/login", json={"email": "space@hospital.example", "password": password}
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    assert (
        admin.get("/api/auth/me", headers={"Authorization": f"bearer {token}"}).status_code == 200
    )
    assert (
        admin.post(
            "/api/auth/login",
            json={"email": "space@hospital.example", "password": password.strip()},
        ).status_code
        == 401
    )

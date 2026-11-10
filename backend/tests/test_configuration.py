import base64
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent


def configuration_process(tmp_path, **overrides):
    environment = {
        **os.environ,
        "APP_ENV": "production",
        "DEMO_MODE": "false",
        "DATA_DIR": str(tmp_path / "data"),
        "SECRET_KEY": "test-only-production-configuration-secret-32-chars",
        "ENCRYPTION_KEY": base64.b64encode(b"x" * 32).decode(),
    }
    environment.update(overrides)
    return subprocess.run(
        [sys.executable, "-c", "import app.config; print('configuration accepted')"],
        env=environment,
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )


@pytest.mark.parametrize(
    "overrides, expected",
    [
        ({"DEMO_MODE": "true"}, "DEMO_MODE must be false"),
        ({"SECRET_KEY": "", "ENCRYPTION_KEY": ""}, "Production requires"),
        ({"SECRET_KEY": "short"}, "at least 32 characters"),
        ({"ENCRYPTION_KEY": "invalid!"}, "valid base64"),
        ({"ENCRYPTION_KEY": "eA=="}, "exactly 32 bytes"),
    ],
)
def test_unsafe_production_configuration_rejected(tmp_path, overrides, expected):
    result = configuration_process(tmp_path, **overrides)
    assert result.returncode != 0
    assert expected in result.stderr


def test_explicit_production_configuration_accepted(tmp_path):
    result = configuration_process(tmp_path)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "configuration accepted"


def test_backend_configuration_works_outside_the_checkout(tmp_path):
    # Docker places app/config.py directly in /app/app, without the repository root.
    package = tmp_path / "app"
    package.mkdir()
    (package / "__init__.py").write_text("")
    shutil.copy(BACKEND / "app" / "config.py", package / "config.py")
    result = subprocess.run(
        [sys.executable, "-c", "import app.config; print('packaged configuration accepted')"],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(tmp_path), "DATA_DIR": str(tmp_path / "data")},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "packaged configuration accepted" in result.stdout


def test_production_secret_generator_is_private_and_never_overwrites(tmp_path):
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    script = scripts / "configure-production.py"
    shutil.copy(ROOT / "scripts" / "configure-production.py", script)
    first = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    assert first.returncode == 0
    generated = tmp_path / ".env.production"
    original = generated.read_text()
    values = dict(line.split("=", 1) for line in original.splitlines())
    assert values["DEMO_MODE"] == "false"
    assert len(values["SECRET_KEY"]) >= 32
    assert len(base64.b64decode(values["ENCRYPTION_KEY"])) == 32
    assert values["SECRET_KEY"] not in first.stdout
    if os.name != "nt":  # Windows permissions are governed by NTFS ACLs.
        assert generated.stat().st_mode & 0o077 == 0
    second = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    assert second.returncode != 0 and generated.read_text() == original


def test_production_cookie_headers_host_policy_and_built_frontend(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "assets").mkdir()
    (static / "index.html").write_text(
        "<!doctype html><html><body>Production test workspace</body></html>"
    )
    program = """
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, SessionLocal, engine
from app.models import User, WorkspaceSettings
from app.auth import hash_password
Base.metadata.create_all(engine)
with SessionLocal() as db:
    db.add(WorkspaceSettings(id=1))
    db.add(User(username="Test Administrator", email="admin@hospital.example", password=hash_password("ProductionTest!2026"), role="admin", department="Administration"))
    db.commit()
with TestClient(app, base_url="https://testserver") as client:
    assert client.get("/api/health").status_code == 200
    assert client.post("/api/auth/demo", headers={"X-Requested-With": "MedGuard"}).status_code == 404
    login = client.post("/api/auth/login", json={"email": "admin@hospital.example", "password": "ProductionTest!2026"}, headers={"X-Requested-With": "MedGuard"})
    assert login.status_code == 200
    assert "Secure" in login.headers["set-cookie"]
    assert "HttpOnly" in login.headers["set-cookie"]
    assert client.get("/api/auth/me").status_code == 200
    home = client.get("/")
    assert "Production test workspace" in home.text
    assert "default-src 'self'" in home.headers["content-security-policy"]
    assert "max-age=" in home.headers["strict-transport-security"]
    assert "Production test workspace" in client.get("/vault").text
    assert client.get("/api/health", headers={"host": "untrusted.example"}).status_code == 400
print("Production workflow passed")
"""
    result = subprocess.run(
        [sys.executable, "-c", program],
        cwd=BACKEND,
        env={
            **os.environ,
            "APP_ENV": "production",
            "DEMO_MODE": "false",
            "DATA_DIR": str(tmp_path / "data"),
            "DATABASE_URL": f"sqlite:///{tmp_path / 'production.db'}",
            "SECRET_KEY": "test-only-production-configuration-secret-32-chars",
            "ENCRYPTION_KEY": base64.b64encode(b"x" * 32).decode(),
            "TRUSTED_HOSTS": "testserver",
            "STATIC_DIR": str(static),
        },
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "Production workflow passed" in result.stdout

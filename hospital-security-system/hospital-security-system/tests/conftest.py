import os
import sys
import tempfile
from pathlib import Path

# Isolate every test run from the demonstration workspace and all user files.
TEST_DIRECTORY = tempfile.TemporaryDirectory(prefix="medguard-tests-")
os.environ["DATA_DIR"] = TEST_DIRECTORY.name
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DIRECTORY.name}/tests.db"
os.environ["APP_ENV"] = "test"
os.environ["DEMO_MODE"] = "false"
os.environ.pop("S3_BUCKET", None)
os.environ.pop("AWS_BUCKET_NAME", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from app.auth import create_access_token, hash_password
from app.config import COOKIE_NAME
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import User
from app.routes.user_routes import attempts

PASSWORD = "HospitalTest!2026"
PASSWORD_HASH = hash_password(PASSWORD)


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    attempts.clear()
    with TestClient(app) as client:
        yield client


@pytest.fixture()
def users(client):
    with SessionLocal() as db:
        accounts = {}
        for role in ("admin", "doctor", "nurse", "auditor"):
            user = User(
                username=f"Test {role.title()}",
                email=f"{role}@hospital.example",
                password=PASSWORD_HASH,
                role=role,
                department="General Medicine",
            )
            db.add(user)
            db.flush()
            accounts[role] = user
        db.commit()
    return accounts


@pytest.fixture()
def as_user(client, users):
    def authenticate(role="admin"):
        client.cookies.clear()
        client.cookies.set(COOKIE_NAME, create_access_token(users[role]))
        client.headers["X-Requested-With"] = "MedGuard"
        return client

    return authenticate


@pytest.fixture()
def admin(as_user):
    return as_user("admin")


@pytest.fixture()
def upload(admin):
    def create(
        classification="Confidential",
        filename="sample.txt",
        content=b"Synthetic clinical demonstration. No real patient data.",
    ):
        response = admin.post(
            "/api/records",
            files={"file": (filename, content, "text/plain")},
            data={
                "patient_id": "TEST-1048",
                "department": "General Medicine",
                "category": "Clinical notes",
                "classification": classification,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    return create

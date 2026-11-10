"""Regression tests for the flat backend layout and private runtime-file upgrade."""

import importlib.util
from contextlib import closing
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEGACY_PARTS = ("hospital-security-system", "hospital-security-system")


def clean_environment(**overrides):
    environment = dict(os.environ)
    for key in (
        "DATA_DIR",
        "DATABASE_URL",
        "SECRET_KEY",
        "ENCRYPTION_KEY",
        "S3_BUCKET",
        "AWS_REGION",
        "AWS_BUCKET_NAME",
        "STATIC_DIR",
        "PYTHONPATH",
    ):
        environment.pop(key, None)
    environment.update(APP_ENV="test", DEMO_MODE="false")
    environment.update(overrides)
    return environment


@pytest.fixture()
def checkout(tmp_path):
    root = tmp_path / "workspace with spaces"
    backend = root / "backend"
    (backend / "app").mkdir(parents=True)
    (backend / "app" / "__init__.py").write_text("")
    shutil.copy(ROOT / "backend" / "app" / "config.py", backend / "app" / "config.py")
    (root / "package.json").write_text("{}")
    (root / "scripts").mkdir()
    shutil.copy(ROOT / "scripts" / "migrate-legacy-layout.py", root / "scripts")
    return root


def configuration(root, **overrides):
    program = """
import json
from app import config
print(json.dumps({
    "root": str(config.REPO_ROOT), "backend": str(config.BACKEND_DIR),
    "data": str(config.DATA_DIR), "static": str(config.STATIC_DIR),
    "database": config.DATABASE_URL, "region": config.AWS_REGION, "bucket": config.S3_BUCKET,
}))
"""
    return subprocess.run(
        [sys.executable, "-c", program],
        cwd=root / "backend",
        env=clean_environment(**overrides),
        capture_output=True,
        text=True,
    )


def legacy_workspace(root):
    legacy = root.joinpath(*LEGACY_PARTS)
    data = legacy / "data"
    (data / "objects").mkdir(parents=True)
    (data / ".secrets.json").write_text('{"example": "private-key-must-not-be-printed"}')
    (data / "objects" / "record.bin").write_bytes(b"MG01\x00private encrypted object\xff")
    (legacy / ".env").write_text("DEMO_MODE=true\nSECRET_KEY=private-config-must-not-be-printed\n")
    with closing(sqlite3.connect(data / "medguard.db")) as database:
        database.execute("CREATE TABLE records (name TEXT)")
        database.execute("INSERT INTO records VALUES ('existing encrypted record')")
        database.commit()
    return legacy


def migration(root, *arguments, **overrides):
    return subprocess.run(
        [sys.executable, str(root / "scripts" / "migrate-legacy-layout.py"), *arguments],
        cwd=root,
        env=clean_environment(**overrides),
        capture_output=True,
        text=True,
    )


def snapshot(directory):
    return {
        path.relative_to(directory): path.read_bytes()
        for path in directory.rglob("*")
        if path.is_file()
    }


def test_default_paths_and_environment_loading_in_new_layout(checkout):
    (checkout / ".env").write_text("AWS_REGION=repo-test-region\n")
    (checkout / "backend" / ".env").write_text("S3_BUCKET=backend-test-bucket\n")
    result = configuration(checkout)
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout)
    assert Path(values["root"]) == checkout
    assert Path(values["backend"]) == checkout / "backend"
    assert Path(values["data"]) == checkout / "backend" / "data"
    assert Path(values["static"]) == checkout / "frontend" / "dist"
    assert values["database"] == f"sqlite:///{checkout / 'backend' / 'data' / 'medguard.db'}"
    assert values["region"] == "repo-test-region"
    assert values["bucket"] == "backend-test-bucket"


@pytest.mark.parametrize("name", ["data", ".env"])
def test_startup_refuses_to_abandon_legacy_state(checkout, name):
    legacy = checkout.joinpath(*LEGACY_PARTS)
    legacy.mkdir(parents=True)
    if name == "data":
        (legacy / name).mkdir()
        (legacy / name / ".secrets.json").write_text("original keys")
    else:
        (legacy / name).write_text("DEMO_MODE=true\n")
    result = configuration(checkout)
    assert result.returncode != 0
    assert "Legacy backend runtime files found" in result.stderr
    assert "migrate-legacy-layout.py" in result.stderr
    assert not (checkout / "backend" / "data").exists()


def test_startup_refuses_ambiguous_default_workspaces(checkout):
    legacy_workspace(checkout)
    (checkout / "backend" / "data").mkdir()
    result = configuration(checkout)
    assert result.returncode != 0
    assert not (checkout / "backend" / "data" / ".secrets.json").exists()


def test_explicit_data_directory_remains_supported(checkout, tmp_path):
    legacy = legacy_workspace(checkout)
    (legacy / ".env").unlink()
    external = tmp_path / "private storage"
    result = configuration(checkout, DATA_DIR=str(external))
    assert result.returncode == 0, result.stderr
    assert Path(json.loads(result.stdout)["data"]) == external
    assert (legacy / "data" / "medguard.db").is_file()
    assert not (checkout / "backend" / "data").exists()


def test_migration_is_read_only_by_default(checkout):
    legacy = legacy_workspace(checkout)
    original = snapshot(legacy)
    result = migration(checkout)
    assert result.returncode == 0, result.stderr
    assert "Dry run only" in result.stdout
    assert "private-key-must-not-be-printed" not in result.stdout
    assert "private-config-must-not-be-printed" not in result.stdout
    assert snapshot(legacy) == original
    assert not (checkout / "backend" / "data").exists()
    assert not (checkout / "backend" / ".env").exists()
    assert not (checkout / "backend" / ".layout-migration.lock").exists()


def test_migration_preserves_database_objects_keys_and_configuration(checkout):
    legacy = legacy_workspace(checkout)
    original = snapshot(legacy)
    result = migration(checkout, "--apply")
    assert result.returncode == 0, result.stderr
    assert "Migration complete" in result.stdout
    assert snapshot(checkout / "backend" / "data") == {
        path.relative_to("data"): data for path, data in original.items() if path.parts[0] == "data"
    }
    assert (checkout / "backend" / ".env").read_bytes() == original[Path(".env")]
    with closing(sqlite3.connect(checkout / "backend" / "data" / "medguard.db")) as database:
        assert database.execute("SELECT name FROM records").fetchone()[0] == (
            "existing encrypted record"
        )
    assert not (checkout / "hospital-security-system").exists()
    assert not (checkout / "backend" / ".layout-migration.lock").exists()
    again = migration(checkout, "--apply")
    assert again.returncode == 0
    assert "Nothing was changed" in again.stdout


@pytest.mark.parametrize("name", ["data", ".env"])
def test_migration_never_overwrites_or_partially_moves_on_collision(checkout, name):
    legacy = legacy_workspace(checkout)
    original = snapshot(legacy)
    destination = checkout / "backend" / name
    if name == "data":
        destination.mkdir()
        (destination / "keep.txt").write_text("new workspace remains untouched")
    else:
        destination.write_text("new configuration remains untouched")
    before_backend = snapshot(checkout / "backend")
    result = migration(checkout, "--apply")
    assert result.returncode != 0
    assert "already exists" in result.stderr
    assert snapshot(legacy) == original
    assert snapshot(checkout / "backend") == before_backend


def test_migration_does_not_delete_unrecognized_user_files(checkout):
    legacy = legacy_workspace(checkout)
    (legacy / "private-notes.txt").write_text("keep this file")
    result = migration(checkout, "--apply")
    assert result.returncode == 0, result.stderr
    assert (legacy / "private-notes.txt").read_text() == "keep this file"
    assert not (legacy / "data").exists()


@pytest.mark.parametrize("variable", ["DATA_DIR", "DATABASE_URL"])
def test_migration_requires_manual_review_of_environment_storage_overrides(checkout, variable):
    legacy = legacy_workspace(checkout)
    original = snapshot(legacy)
    result = migration(checkout, "--apply", **{variable: "custom-storage-path"})
    assert result.returncode != 0
    assert "Custom DATA_DIR or DATABASE_URL" in result.stderr
    assert snapshot(legacy) == original
    assert not (checkout / "backend" / "data").exists()


@pytest.mark.parametrize("location", ["root", "backend", "legacy"])
def test_migration_requires_manual_review_of_dotenv_storage_overrides(checkout, location):
    legacy = legacy_workspace(checkout)
    directories = {"root": checkout, "backend": checkout / "backend", "legacy": legacy}
    if location == "backend":
        (legacy / ".env").unlink()
    env_file = directories[location] / ".env"
    env_file.write_text("export DATA_DIR=/custom/private/storage\n")
    before = snapshot(legacy)
    result = migration(checkout, "--apply")
    assert result.returncode != 0
    assert "Custom DATA_DIR or DATABASE_URL" in result.stderr
    assert snapshot(legacy) == before


def test_migration_does_not_replace_another_process_lock(checkout):
    legacy = legacy_workspace(checkout)
    before = snapshot(legacy)
    lock = checkout / "backend" / ".layout-migration.lock"
    lock.write_text("another migration")
    result = migration(checkout, "--apply")
    assert result.returncode != 0
    assert "migration lock already exists" in result.stderr
    assert snapshot(legacy) == before
    assert lock.read_text() == "another migration"


def test_migration_rolls_back_if_a_move_fails(checkout, monkeypatch):
    legacy = legacy_workspace(checkout)
    before = snapshot(legacy)
    spec = importlib.util.spec_from_file_location(
        "migrate_legacy_layout", ROOT / "scripts" / "migrate-legacy-layout.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    rename = Path.rename

    def fail_env_move(source, destination):
        if source == legacy / ".env":
            raise OSError("simulated locked configuration file")
        return rename(source, destination)

    monkeypatch.setattr(Path, "rename", fail_env_move)
    with pytest.raises(OSError, match="simulated locked"):
        module.migrate(checkout, apply=True)
    assert snapshot(legacy) == before
    assert not (checkout / "backend" / "data").exists()
    assert not (checkout / "backend" / ".layout-migration.lock").exists()


def test_migration_refuses_symbolic_links(checkout, tmp_path):
    legacy = legacy_workspace(checkout)
    external = tmp_path / "external-private-file"
    external.write_text("do not touch")
    try:
        (legacy / "data" / "linked-object").symlink_to(external)
    except OSError:
        pytest.skip("Symbolic-link creation is unavailable for this Windows account")
    result = migration(checkout, "--apply")
    assert result.returncode != 0
    assert "symbolic links" in result.stderr
    assert external.read_text() == "do not touch"
    assert (legacy / "data").is_dir()


def test_migration_on_a_fresh_checkout_does_nothing(checkout):
    result = migration(checkout, "--apply")
    assert result.returncode == 0
    assert "Nothing was changed" in result.stdout
    assert not (checkout / "backend" / "data").exists()


def test_existing_record_downloads_after_full_layout_upgrade(checkout, upload):
    from app.config import DATA_DIR, ENCRYPTION_KEY, SECRET_KEY
    from app.database import engine
    from conftest import PASSWORD

    content = b"Synthetic record retained across the folder-layout upgrade."
    record = upload(content=content)
    shutil.copytree(
        ROOT / "backend" / "app",
        checkout / "backend" / "app",
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    legacy_data = checkout.joinpath(*LEGACY_PARTS) / "data"
    legacy_data.mkdir(parents=True)
    (legacy_data / ".secrets.json").write_text(
        json.dumps({"jwt": SECRET_KEY, "encryption": ENCRYPTION_KEY})
    )
    with closing(sqlite3.connect(engine.url.database)) as original:
        with closing(sqlite3.connect(legacy_data / "medguard.db")) as backup:
            original.backup(backup)
    shutil.copytree(DATA_DIR / "objects", legacy_data / "objects")

    moved = migration(checkout, "--apply")
    assert moved.returncode == 0, moved.stderr
    program = """
import os
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    login = client.post("/api/auth/login", headers={"X-Requested-With": "MedGuard"}, json={
        "email": "admin@hospital.example", "password": os.environ["TEST_PASSWORD"],
    })
    assert login.status_code == 200
    records = client.get("/api/records").json()
    assert records["total"] == 1
    assert records["items"][0]["id"] == os.environ["TEST_RECORD_ID"]
    download = client.get("/api/records/" + os.environ["TEST_RECORD_ID"] + "/download")
    assert download.status_code == 200
    assert download.content == b"Synthetic record retained across the folder-layout upgrade."
print("Existing account, record metadata, encryption key, and download verified")
"""
    result = subprocess.run(
        [sys.executable, "-c", program],
        cwd=checkout / "backend",
        env=clean_environment(TEST_PASSWORD=PASSWORD, TEST_RECORD_ID=record["id"]),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "encryption key, and download verified" in result.stdout

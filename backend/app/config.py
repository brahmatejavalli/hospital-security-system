"""Environment configuration. Development secrets are generated once, never hard-coded."""

import base64
import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = next(
    (parent for parent in BACKEND_DIR.parents if (parent / "package.json").is_file()), BACKEND_DIR
)
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")

# Git relocates tracked source, not ignored databases, objects, or local keys.
# Do not silently initialize a different workspace after a layout upgrade.
LEGACY_BACKEND_DIR = REPO_ROOT / "hospital-security-system" / "hospital-security-system"
legacy_env = LEGACY_BACKEND_DIR / ".env"
legacy_data = LEGACY_BACKEND_DIR / "data"
if (
    legacy_env.exists()
    or legacy_env.is_symlink()
    or (not os.getenv("DATA_DIR") and (legacy_data.exists() or legacy_data.is_symlink()))
):
    raise RuntimeError(
        "Legacy backend runtime files found. Stop the servers, back up your data and keys, "
        "and run python scripts/migrate-legacy-layout.py from the repository root. "
        "See docs/UPGRADING.md. No new default workspace was created."
    )

ENVIRONMENT = os.getenv("APP_ENV", "development")
PRODUCTION = ENVIRONMENT == "production"
DEMO_MODE = os.getenv("DEMO_MODE", "false" if PRODUCTION else "true").lower() == "true"
if PRODUCTION and DEMO_MODE:
    raise RuntimeError("DEMO_MODE must be false in production.")

DATA_DIR = Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data"))).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'medguard.db'}")
SECRET_KEY = os.getenv("SECRET_KEY", "")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
if SECRET_KEY and len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must contain at least 32 characters.")

if PRODUCTION and (len(SECRET_KEY) < 32 or not ENCRYPTION_KEY):
    raise RuntimeError(
        "Production requires SECRET_KEY (32+ characters) and a base64 ENCRYPTION_KEY (32 decoded bytes)."
    )
if not SECRET_KEY or not ENCRYPTION_KEY:
    secret_file = DATA_DIR / ".secrets.json"
    if not secret_file.exists():
        # O_EXCL avoids overwriting keys during concurrent worker startup.
        try:
            fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as handle:
                json.dump(
                    {
                        "jwt": secrets.token_urlsafe(48),
                        "encryption": base64.b64encode(secrets.token_bytes(32)).decode(),
                    },
                    handle,
                )
        except FileExistsError:
            pass
    with secret_file.open() as handle:
        generated = json.load(handle)
    SECRET_KEY = SECRET_KEY or generated["jwt"]
    ENCRYPTION_KEY = ENCRYPTION_KEY or generated["encryption"]
try:
    ENCRYPTION_KEY_BYTES = base64.b64decode(ENCRYPTION_KEY, validate=True)
except (ValueError, TypeError) as exc:
    raise RuntimeError("ENCRYPTION_KEY must be valid base64.") from exc
if len(ENCRYPTION_KEY_BYTES) != 32:
    raise RuntimeError("ENCRYPTION_KEY must decode to exactly 32 bytes.")

ALGORITHM = "HS256"
COOKIE_NAME = "medguard_session"
TRUSTED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "TRUSTED_HOSTS", "localhost,127.0.0.1,*.e2b.app" if PRODUCTION else "*"
    ).split(",")
    if host.strip()
]
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
S3_BUCKET = os.getenv("S3_BUCKET", os.getenv("AWS_BUCKET_NAME", ""))
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
STATIC_DIR = Path(os.getenv("STATIC_DIR", str(REPO_ROOT / "frontend" / "dist")))
DEPARTMENTS = [
    "Administration",
    "Cardiology",
    "Emergency",
    "General Medicine",
    "Neurology",
    "Orthopedics",
    "Pediatrics",
    "Radiology",
]
CATEGORIES = [
    "Clinical notes",
    "Discharge summary",
    "Imaging",
    "Lab report",
    "Prescription",
    "Other",
]
CLASSIFICATIONS = ["Confidential", "Restricted", "Internal"]

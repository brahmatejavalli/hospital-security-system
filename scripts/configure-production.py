"""Generate a private, untracked production configuration without printing keys."""

import base64
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = root / ".env.production"
try:
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit(
        ".env.production already exists. It was NOT overwritten; replacing keys would make existing records unreadable."
    )
with os.fdopen(descriptor, "w") as handle:
    handle.write(
        "APP_ENV=production\nDEMO_MODE=false\n"
        f"SECRET_KEY={secrets.token_urlsafe(48)}\n"
        f"ENCRYPTION_KEY={base64.b64encode(secrets.token_bytes(32)).decode()}\n"
        "TRUSTED_HOSTS=localhost,127.0.0.1\n"
        "AWS_REGION=ap-south-1\n"
    )
print(
    "Created .env.production (mode 600 on POSIX; restrict NTFS ACLs on Windows). Add your public hostname to TRUSTED_HOSTS. Back up the keys securely and never commit this file."
)

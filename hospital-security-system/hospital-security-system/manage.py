"""Administrative bootstrap. Passwords are read securely, never from CLI arguments."""

import argparse
import getpass
import os

from email_validator import validate_email
from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import User, WorkspaceSettings
from app.schemas import validate_password


def main():
    parser = argparse.ArgumentParser(description="Create a MedGuard administrator")
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    email = validate_email(args.email, check_deliverability=False).normalized.lower()
    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass(
        "Administrator password (12+ characters, a letter and number): "
    )
    validate_password(password)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.query(User).filter(User.email == email).first():
            parser.error("An account with this email already exists.")
        if not db.get(WorkspaceSettings, 1):
            db.add(WorkspaceSettings(id=1))
        db.add(
            User(
                username=args.name,
                email=email,
                password=hash_password(password),
                role="admin",
                department="Administration",
            )
        )
        db.commit()
    print(f"Administrator created: {email}")


if __name__ == "__main__":
    main()

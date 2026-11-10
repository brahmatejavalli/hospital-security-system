"""Move private runtime files from the old layout without rewriting or replacing them.

Dry-run by default. Stop all application processes and back up the database,
objects, and keys before using --apply. This is not a database-schema migration.
"""

import argparse
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUSTOM_STORAGE = re.compile(r"^\s*(?:export\s+)?(?:DATA_DIR|DATABASE_URL)\s*=", re.MULTILINE)


def migration_plan(root: Path) -> list[tuple[Path, Path]]:
    backend = root / "backend"
    legacy = root / "hospital-security-system" / "hospital-security-system"
    if not backend.is_dir() or backend.is_symlink():
        raise ValueError("Run this script from the new checkout containing backend/.")
    if legacy.is_symlink() or legacy.parent.is_symlink():
        raise ValueError("Legacy directories are symbolic links; review and migrate them manually.")

    plan = []
    for name in ("data", ".env"):
        source, destination = legacy / name, backend / name
        if source.is_symlink():
            raise ValueError(f"Legacy {name} is a symbolic link; migrate it manually.")
        if not source.exists():
            continue
        if destination.exists() or destination.is_symlink():
            raise FileExistsError(
                f"backend/{name} already exists. Nothing was moved. "
                "Back up and reconcile the old and new workspaces manually; do not replace keys."
            )
        if name == "data" and not source.is_dir():
            raise ValueError("Legacy data is not a directory.")
        if name == ".env" and not source.is_file():
            raise ValueError("Legacy .env is not a regular file.")
        if source.is_dir() and any(path.is_symlink() for path in source.rglob("*")):
            raise ValueError("Legacy data contains symbolic links; review and migrate it manually.")
        plan.append((source, destination))

    if plan:
        # Moving a directory referenced by an explicit path can silently create a
        # second workspace on the next launch. Leave custom storage alone.
        if os.getenv("DATA_DIR") or os.getenv("DATABASE_URL"):
            raise ValueError(
                "Custom DATA_DIR or DATABASE_URL is set. Nothing was moved. "
                "Follow docs/UPGRADING.md to review your storage paths manually."
            )
        for env_file in (root / ".env", backend / ".env", legacy / ".env"):
            if env_file.is_file() and CUSTOM_STORAGE.search(
                env_file.read_text(encoding="utf-8-sig")
            ):
                raise ValueError(
                    "Custom DATA_DIR or DATABASE_URL found in an .env file. Nothing was moved. "
                    "Follow docs/UPGRADING.md to review your storage paths manually."
                )
    return plan


def migrate(root: Path, apply: bool) -> None:
    plan = migration_plan(root)
    if not plan:
        print("No legacy runtime files found. Nothing was changed.")
        return
    for source, destination in plan:
        print(f"{source.relative_to(root)} -> {destination.relative_to(root)}")
    if not apply:
        print("Dry run only. Stop all servers and back up data and keys, then rerun with --apply.")
        return

    lock = root / "backend" / ".layout-migration.lock"
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError(
            "A migration lock already exists. Check for another migration process before retrying."
        ) from None
    os.close(descriptor)
    moved = []
    try:
        # Recheck under the migration lock. The application also refuses to
        # create a fresh default workspace while legacy runtime files remain.
        plan = migration_plan(root)
        try:
            for source, destination in plan:
                source.rename(destination)
                moved.append((source, destination))
        except BaseException:
            for source, destination in reversed(moved):
                if not source.exists():
                    destination.rename(source)
            raise
        print("Migration complete. Database, encrypted objects, and keys were not rewritten.")
        legacy = root / "hospital-security-system" / "hospital-security-system"
        # Remove empty containers only. Unrecognized user files are never deleted.
        for directory in (legacy, legacy.parent):
            try:
                directory.rmdir()
            except OSError:
                pass
    finally:
        lock.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Apply moves after stopping/backing up"
    )
    args = parser.parse_args()
    try:
        migrate(ROOT, args.apply)
    except (OSError, ValueError) as exc:
        parser.exit(1, f"Migration stopped: {exc}\n")


if __name__ == "__main__":
    main()

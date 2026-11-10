# Upgrading from the old folder layout

The tracked FastAPI files now live in `backend/`, instead of `hospital-security-system/hospital-security-system/`. React remains in `frontend/`. There is one root Dockerfile and one root Compose file. Endpoint URLs, the database schema, record encryption format, and Docker's `/data` location have **not** changed.

## Fresh downloads

If you have never run the old checkout, no migration is necessary. Follow the [root quick start](../README.md#quick-start). New private state is generated under `backend/data/`.

## Existing local default workspace

**Do not delete the old folder or its private data.** Git moves tracked source, not your ignored `data/` directory or `.env` files.

1. Stop both the old frontend and backend (Ctrl+C in their terminals). Do not run either version during the migration.
2. Back up the **complete old `data/` directory**, including hidden `.secrets.json`, `medguard.db`, any SQLite `-wal`/`-shm` companions, and `objects/`. Also back up private `.env` files. Keep the backup outside the repository in private storage.
3. Update/extract the restructured source. Run the following from the **repository root** to preview the moves:

   ```powershell
   python scripts/migrate-legacy-layout.py
   ```

   This is a dry run: it does not create a new workspace or move anything.

4. After checking the plan and backup, apply it:

   ```powershell
   python scripts/migrate-legacy-layout.py --apply
   ```

   The tool moves old `data/` to `backend/data/` and old backend `.env` to `backend/.env`, when present. It does **not** regenerate keys, rewrite database rows, or decrypt/re-encrypt objects. It uses same-filesystem renames, retains unknown user files, and removes old containers only if they are empty. It does not combine workspaces or overwrite an existing destination. A failed later move rolls earlier moves back when possible.

5. Reinstall Python dependencies at their new location and start the app. On Windows:

   ```powershell
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   npm.cmd ci
   npm.cmd run dev
   ```

   On macOS/Linux, use `.venv/bin/python -m pip install -r backend/requirements.txt`, then `npm ci` and `npm run dev`.

6. Confirm your previous staff, settings, and records are present, and verify a previous record can still be downloaded. Keep the backup until recovery has been verified.

The new backend refuses to silently initialize a fresh default workspace when legacy private files remain. The error points to this guide and the migration tool.

## If both old and new data already exist

The tool stops before moving anything if `backend/data/` or `backend/.env` would be replaced. This is intentional. **Do not copy a database onto a different workspace's key file.** Back up both complete sets and decide which workspace you intend to use. There is no automatic database/account/object merge.

If a previous migration was interrupted, inspect both locations and your backup before retrying. A remaining `backend/.layout-migration.lock` must only be removed after confirming no migration process is running. The tool never removes another process's lock.

## Custom storage or environment overrides

The automatic tool refuses to move files when `DATA_DIR` or `DATABASE_URL` is assigned in the process environment or an applicable `.env` file. A custom database path may point to the old directory, external storage, or another server; guessing would risk a split workspace.

For a reviewed manual upgrade:

1. Stop the app and back up data, objects, keys, and configuration together.
2. Decide whether to **keep the existing absolute storage location** or explicitly relocate it. Custom external directories and S3 objects are not moved by this tool.
3. Review root `.env` and the old backend `.env`. Move the latter to `backend/.env` only after checking for conflicts. Do not leave the old backend `.env` behind: startup deliberately flags it so its settings cannot be silently ignored.
4. Set absolute `DATA_DIR` and matching `DATABASE_URL` values in the new configuration. Relative paths are now evaluated from the new `backend/` working directory. Keep `SECRET_KEY` and `ENCRYPTION_KEY` unchanged. If using generated development keys, preserve `.secrets.json` inside the chosen data directory.
5. Ensure local object storage and the metadata database refer to the **same** existing workspace; then restart and verify an existing download.

An explicit `DATA_DIR` is honored even if old data remains in the checkout. This lets a reviewed configuration keep a private legacy storage location without silently resetting it.

## Docker deployments

Use only the root `Dockerfile` and `docker-compose.yml`; the nested copies have been removed. Build contexts now copy `backend/` source, but the container still uses `/app`, the same service/volume names, `/data`, keys, and port 8000.

- Run Compose from the repository root and retain the same Compose project name (`COMPOSE_PROJECT_NAME` or `-p`) so it reuses the intended volume.
- Deployments previously started from the nested compatibility Compose file must check `docker compose ls` and `docker volume ls`, then select that **existing project name** explicitly from the root. Do not assume the root's default project name selects the old volume.
- If the repository root itself is renamed, keep the prior Compose project name or explicitly configure the existing volume; a different project name normally creates a different named volume.
- Preserve `.env.production` and any externally supplied keys. Do not regenerate them for this folder change.
- Never run `docker compose down -v` on data you need to retain.

This script only upgrades filesystem layout. It is **not** a migration for pre-v1 database schemas, storage-provider changes, or encryption-key rotation. Those still require separate reviewed migrations.

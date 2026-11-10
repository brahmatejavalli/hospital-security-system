# MedGuard · Hospital Security Workspace

A working full-stack hospital records security application, built on the original FastAPI project. A responsive React interface connects to authenticated APIs for encrypted records, staff permissions, audit history, security alerts, and workspace management.

**React 19 · TypeScript · FastAPI · SQLAlchemy · AES-256-GCM · SHA3-256**

> **Demo data only.** The local preview automatically opens an administrator demo with synthetic records and staff. Do not upload real patient information to a shared demo. Production mode forbids demo access and requires explicit keys.

## What’s included

- **Live overview:** database-backed metrics, 7/30/90-day access charts, recent records and activity, a transparent security-posture indicator, and CSV reports.
- **Encrypted records vault:** file upload and drag-and-drop, patient reference IDs, departments, record types, classifications, search and filters, sorting, pagination, metadata/checksum details, verified downloads, and administrator deletion.
- **People & access:** create accounts, assign one of four roles, change departments, activate/deactivate accounts, reset member passwords, and revoke existing sessions on access changes.
- **Audit trail:** authenticated metadata access, uploads, downloads, blocked actions, sign-ins, role changes, password changes/resets, settings changes, alert resolutions, and exports. Search, event/outcome/date filters, event details, and spreadsheet-safe CSV exports.
- **Security alerts:** repeated failed sign-ins, blocked content access, and integrity failures. Priority/status filters, recommendations, administrator resolution notes, and a retained review history.
- **Settings & accounts:** workspace identity, security contact, timezone, session lifetime, personal profile, self-service password changes, sign-out/session revocation, and read-only security controls.
- **Usable interface:** keyboard workspace search (`Ctrl/⌘ K`), notification menu, help center, responsive navigation, accessible dialogs, loading/error/empty states, and local font assets.
- **Operational basics:** local storage by default, optional private AWS S3, production configuration generator, non-root Docker image, health check, tests, and CI.

### Permission model

| Capability | Administrator | Doctor | Nurse | Auditor |
| --- | :---: | :---: | :---: | :---: |
| Search/view record metadata | ✓ | ✓ | ✓ | ✓ |
| Upload Internal/Confidential records | ✓ | ✓ | ✓ | — |
| Upload/download Restricted content | ✓ | ✓ | — | — |
| Download other record contents | ✓ | ✓ | ✓ | — |
| Delete records | ✓ | — | — | — |
| Manage staff and reset member passwords | ✓ | — | — | — |
| Read/export audit events and overview reports | ✓ | — | — | ✓ |
| Inspect security alerts | ✓ | — | — | ✓ |
| Resolve alerts/edit workspace settings | ✓ | — | — | — |
| Edit own profile/password | ✓ | ✓ | ✓ | ✓ |

Permissions are enforced on the server. Auditors can inspect metadata, **not file contents**. Synthetic demo accounts have randomly generated, non-recoverable passwords; only the development demo administrator has the explicit demo-entry flow. Real test accounts can be created from **People & access**.

## Quick start

Requirements: **Python 3.11+**, **Node.js 22.12+**, and npm. No AWS account, external database, or `.env` file is needed for local development. The CI configuration checks Python 3.11 on Linux and Python 3.14 on Windows; verify other Python versions with the test suite rather than assuming compatibility.

Run commands from the **repository root**: the folder containing `package.json`, `backend/`, and `frontend/`. Do not run the setup inside either application folder.

### Windows PowerShell

Use your installed `python` command; no exact Python patch version or environment activation is required. Run each command separately and stop if one fails.

```powershell
python --version
node --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
npm.cmd ci
npm.cmd run dev
```

`npm.cmd` avoids PowerShell script-execution-policy issues. The Python version printed by `python --version` is **output**, not another command. If a version-specific `py` command reports “No suitable Python runtime found,” use `python --version` to identify the interpreter actually installed before selecting one.

### macOS / Linux

```bash
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run dev
```

If your system provides only `python3`, use `python3 -m venv .venv` for the first command. `requirements-dev.txt` includes runtime dependencies and test tools; for runtime only, use `backend/requirements.txt` instead.

Open **http://localhost:5173** and keep the terminal running. Press **Ctrl+C** to stop both services. The API runs on port **8000**, with interactive docs at **http://localhost:5173/api/docs**. Both services bind to `0.0.0.0`; the frontend uses same-origin `/api` requests and Vite’s proxy, including in hosted previews. An existing Python executable can be selected with `PYTHON`.

**Already ran an older version?** Stop it, back up its database/objects/keys, and follow [Upgrading the old folder layout](docs/UPGRADING.md) **before** starting this version. Git does not move ignored private runtime files.

The first launch creates:

- 128 synthetic, valid PDF records, encrypted before storage;
- 12 synthetic staff accounts (11 active);
- 14 days of clearly marked sample history and five sample alerts;
- a private local SQLite database, object directory, and generated development keys under `backend/data/`.

All runtime data, keys, dependencies, and generated bundles are ignored by Git. The demo persists across restarts. Signing out stays signed out in that browser tab; use **Explore demo workspace** to re-enter. Real test accounts use the normal email/password sign-in form.

### Run the built application on one port

From the repository root, on Windows PowerShell:

```powershell
npm.cmd run build
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

On macOS/Linux:

```bash
npm run build
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

FastAPI then serves the built frontend, API, and SPA routes at **http://localhost:8000**. This is still a development/demo deployment unless production environment variables are explicitly set. See the [backend guide](backend/README.md) for API-only startup.

## Production configuration & Docker

**This is not a certification of HIPAA, GDPR, or other regulatory compliance.** Before handling real patient data, complete the checklist in [SECURITY.md](SECURITY.md), including TLS, metadata encryption at the infrastructure layer, protected backups, external audit retention, and an organizational security review.

1. Generate private keys without printing them:

   ```bash
   python scripts/configure-production.py
   ```

   This writes an ignored `.env.production` (mode 600 on POSIX; restrict its NTFS ACLs on Windows). It never overwrites existing keys. Back it up in an approved secret store. Add your public hostname to `TRUSTED_HOSTS`.

2. Build and provision the first administrator:

   ```bash
   docker compose --env-file .env.production build
   docker compose --env-file .env.production run --rm app python manage.py create-admin \
     --email admin@your-hospital.org --name "Hospital Administrator"
   ```

   The password is read securely from the terminal, not a command-line argument. There are **no default production credentials**. `ADMIN_PASSWORD` is supported for a secure provisioning environment, but is not needed for interactive setup.

3. Run behind an HTTPS reverse proxy:

   ```bash
   docker compose --env-file .env.production up -d
   ```

   The application listens on port 8000 and stores data in the `medguard_data` volume. Production sessions use `Secure` cookies and require HTTPS for browser sign-in; plain HTTP is only suitable for the public health check. Back up the volume **and** encryption key. Never use `docker compose down -v` on data you need to retain.

Docker builds the frontend and serves it from FastAPI as a non-root user. Compose enables a read-only root filesystem, drops Linux capabilities, and persists only the data volume. The duplicate nested Docker/Compose files have been removed; the root files are the single deployment configuration. Preserve the existing Compose project name/volume when upgrading; see [UPGRADING.md](docs/UPGRADING.md#docker-deployments).

### Environment reference

| Variable | Default / purpose |
| --- | --- |
| `APP_ENV` | `development`; set `production` to enforce explicit keys and production headers/cookies |
| `DEMO_MODE` | `true` in development, `false` in production; **production refuses `true`** |
| `DATA_DIR` | Private backend `data/` directory; `/data` in Docker |
| `DATABASE_URL` | Local SQLite; supports MySQL via `mysql+pymysql://…`. Other SQLAlchemy databases require their matching driver |
| `SECRET_KEY` | JWT signing secret, 32+ characters. Generated and persisted only in development |
| `ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes. Generated and persisted only in development |
| `TRUSTED_HOSTS` | Production allowed-host patterns; configure your real hostname. Development accepts the preview host |
| `S3_BUCKET` | Empty means local private objects. A non-empty private bucket enables S3 |
| `AWS_REGION` | `ap-south-1` |
| `STATIC_DIR` | Built frontend directory; normally detected automatically |
| `API_PORT`, `FRONTEND_PORT` | Development launcher ports; 8000 and 5173 |
| `API_TARGET` | Development proxy upstream; never sent to the browser |

See [.env.example](.env.example). AWS credentials use the standard provider chain (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`, or preferably an IAM role). S3 uploads are application-encrypted and request server-side encryption too. No public S3 URLs are generated. Bucket versioning/retention must be configured according to your deletion policy; deleting a current object does not erase old versions.

### Existing databases

The application initializes its **v1 schema for fresh databases**. It does not silently migrate the original minimal `users`/`files` schema. Do not point it at an existing hospital database without a reviewed migration and backup. Metadata and file ciphertext are separate; moving between local storage and S3 also requires an explicit object migration.

## Tests & verification

```bash
# Backend isolation, authentication, policy, storage, and workflow tests
.venv/bin/python -m pytest -q

# Python lint and formatting
.venv/bin/ruff check backend scripts
.venv/bin/ruff format --check backend scripts

# Frontend unit/component tests, TypeScript check, production build
npm run format:check
npm test
npm run build
npm audit --audit-level=high

# Real Chromium workflows and automated accessibility checks
npx playwright install --with-deps chromium
npm run test:e2e
```

On Windows, run backend tests with `.\.venv\Scripts\python.exe -m pytest -q`, Ruff with `.\.venv\Scripts\python.exe -m ruff check backend scripts`, and npm commands with `npm.cmd`.

Browser tests automatically start an **isolated temporary demo** on ports 5174/8001 and remove its data afterward. They do not mutate your development database. Use `CHROMIUM_EXECUTABLE_PATH` for an already installed compatible Chromium, or `E2E_BASE_URL` to explicitly test a separate disposable server. Automated accessibility checks do not replace manual accessibility testing.

CI runs the same checks for pushes and pull requests. Docker and live S3/MySQL integration require those services and should be validated in the target deployment environment.

## API highlights

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login`, `/logout` | Sign in/out; token versioning revokes sessions |
| `GET /api/auth/me` | Current account and permissions |
| `POST /api/auth/demo` | Development-only sample administrator session |
| `PATCH /api/auth/profile`, `POST /api/auth/password` | Profile and password management |
| `GET/POST /api/records` | Search/list metadata or upload a multipart record |
| `GET /api/records/{id}` | Retrieve and audit metadata access |
| `GET /api/records/{id}/download` | Authorize, decrypt, verify, and download |
| `DELETE /api/records/{id}` | Administrator removal; audit history retained |
| `GET/POST /api/staff`, `PATCH /api/staff/{id}` | Administrator account and access management |
| `POST /api/staff/{id}/password` | Administrator password reset with session revocation |
| `GET /api/dashboard`, `/api/search` | Overview and permission-aware workspace search |
| `GET /api/audit`, `/api/audit/export` | Filtered read-only events and CSV export |
| `GET /api/alerts`, `POST /api/alerts/{id}/resolve` | Alert review and resolution |
| `GET/PATCH /api/workspace` | Workspace preferences |
| `GET /api/reports/overview`, `/api/health` | CSV overview and public liveness check |

The API accepts HttpOnly cookie sessions or the bearer token returned by normal sign-in. The frontend **never stores tokens in localStorage**. API mutations require `X-Requested-With: MedGuard` unless a valid same-origin `Origin` header is present. Cross-site origins are rejected; CORS is not broadly enabled. Downloads always use attachment disposition and `nosniff`.

Legacy `/user/login`, `/user/register`, and `/file/upload` routes remain as deprecated, **policy-protected** aliases. Public registration is intentionally removed; legacy uploads now require record metadata and return record details, not ciphertext.

## Project structure

```text
backend/                      FastAPI application, Python dependencies, backend tests
frontend/                     React application, public assets, frontend unit tests
e2e/                          Browser workflows and accessibility checks
scripts/                      Startup, testing, production setup, layout migration
docs/                         Architecture, file ownership, upgrade instructions
.github/workflows/            CI checks (Linux and Windows)
Dockerfile                    Single full-stack image definition
docker-compose.yml            Single production Compose configuration
package.json, package-lock.json  Shared Node dependencies and commands
pyproject.toml                Shared Python test discovery and lint configuration
README.md, SECURITY.md        Main setup and security documentation
```

Application source is no longer buried in duplicate `hospital-security-system` directories. Root configuration files stay at the root intentionally; generated data/dependencies/builds are ignored.

- [Complete file map](docs/PROJECT_STRUCTURE.md)
- [Backend guide](backend/README.md) · [Frontend guide](frontend/README.md)
- [Architecture and data flows](docs/ARCHITECTURE.md)
- [Upgrading an existing workspace](docs/UPGRADING.md)
- [Security boundaries and deployment checklist](SECURITY.md)

Licensed under [MIT](LICENSE).

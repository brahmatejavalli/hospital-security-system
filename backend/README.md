# Backend · MedGuard API

All Python application code, dependencies, and backend tests live here. There is no second nested backend or separate backend deployment configuration.

## Contents

| Path | Responsibility |
| --- | --- |
| `app/main.py` | FastAPI startup, middleware, API routes, health check, built-frontend serving |
| `app/routes/` | Account/access, encrypted-record, and workspace HTTP endpoints |
| `app/config.py` | Environment loading, repository paths, private keys, storage settings |
| `app/database.py`, `app/models.py`, `app/schemas.py` | Persistence and request/response validation |
| `app/auth.py`, `app/encryption.py` | Passwords, sessions, authorization, authenticated encryption |
| `app/s3_service.py` | Private local/S3 ciphertext storage |
| `app/services.py`, `app/seed.py` | Workspace services and synthetic demo initialization |
| `tests/` | Isolated backend and layout-upgrade tests |
| `manage.py` | Secure initial-administrator provisioning |
| `requirements.txt` | Runtime Python dependencies |
| `requirements-dev.txt` | Runtime dependencies plus testing/lint tools |
| `data/` | Generated private database, objects, and development keys; **ignored by Git** |

## Run the whole application

Use the **[root quick start](../README.md#quick-start)**. Run `npm run dev` from the repository root to start the API and React frontend together. The launcher uses this folder as the backend working directory and detects `.venv/Scripts/python.exe` on Windows.

## Run only the API

Create the root `.venv` and install `backend/requirements.txt` first. Then, **from this `backend/` directory**:

### Windows PowerShell

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

### macOS / Linux

```bash
../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

Health: `http://localhost:8000/api/health`. API documentation: `http://localhost:8000/api/docs`.

If `frontend/dist/` has been generated with `npm run build`, the API also serves the frontend on port 8000. Otherwise use the Vite frontend on 5173.

## Configuration and tests

Configuration reads the root `.env`, then optional `backend/.env`, without overriding values already set in the environment. Prefer absolute custom storage paths. Production requires explicit keys, `DEMO_MODE=false`, HTTPS, and a trusted host list.

Run Python tests from the **repository root**:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

On macOS/Linux, use `.venv/bin/python -m pytest -q`.

Use the **root** `Dockerfile` and `docker-compose.yml` for deployment. Read [SECURITY.md](../SECURITY.md) before handling real records and [UPGRADING.md](../docs/UPGRADING.md) before moving an existing workspace from the old layout.

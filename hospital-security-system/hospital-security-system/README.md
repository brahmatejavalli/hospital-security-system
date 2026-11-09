# MedGuard backend

This is the original backend location, retained for compatibility. The project now includes a complete React frontend, encrypted persistent storage, authenticated role policies, staff management, security alerts, reports, and tests.

**Start at the [root README](../../README.md)** for setup, demo access, deployment, environment variables, API endpoints, and security notes.

For API-only development, from this directory:

```bash
../../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

API docs: `/api/docs`. Local development creates an explicitly synthetic demonstration workspace; production disables demo access and requires explicit keys. The nested Dockerfile is API-only. The root Dockerfile builds and serves both the frontend and API.

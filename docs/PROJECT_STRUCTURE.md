# Project structure

The repository is a small full-stack monorepo: **one Python backend, one React frontend, and one set of root tooling/deployment files**. The old double-nested backend and duplicate deployment files have been replaced, not kept as parallel applications.

```text
hospital-security-system/
├── backend/
│   ├── app/
│   │   ├── routes/                Account, record, and workspace endpoints
│   │   ├── main.py                FastAPI entrypoint and static frontend serving
│   │   ├── config.py              Environment, paths, storage, and key configuration
│   │   ├── database.py            SQLAlchemy engine and sessions
│   │   ├── models.py              Persistent entities
│   │   ├── schemas.py             Validated input/output models
│   │   ├── auth.py                Password hashing, sessions, access policies
│   │   ├── encryption.py          AES-GCM envelopes and content checksums
│   │   ├── middleware.py          Request-size limits
│   │   ├── s3_service.py          Local/S3 encrypted-object operations
│   │   ├── services.py            Audit, alerts, reporting, workspace helpers
│   │   └── seed.py                Explicitly synthetic development data
│   ├── tests/                    Backend and safe layout-migration tests
│   ├── data/                     Generated private state; NOT tracked
│   ├── manage.py                 Initial administrator CLI
│   ├── requirements.txt          Runtime Python dependencies
│   ├── requirements-dev.txt      Runtime + pytest/httpx/Ruff
│   └── README.md                 Backend-specific guide
├── frontend/
│   ├── public/                   Public assets
│   ├── src/
│   │   ├── components/           Reusable UI, navigation, records, charts
│   │   ├── pages/                Route-level screens
│   │   ├── lib/                  API/auth/query helpers and shared types
│   │   ├── App.tsx               Routes and authentication guards
│   │   ├── main.tsx              React bootstrap
│   │   ├── styles.css            Responsive application styles
│   │   ├── print.css             Printed report styles
│   │   └── test-setup.ts          Shared frontend test setup
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── README.md                 Frontend-specific guide
├── e2e/                          Browser workflow/accessibility tests
├── scripts/
│   ├── dev.mjs                   Cross-platform API + Vite launcher
│   ├── e2e-server.mjs            Disposable browser-test workspace
│   ├── configure-production.py   Exclusive-create production key generator
│   └── migrate-legacy-layout.py  Guarded upgrade of old private runtime files
├── docs/
│   ├── PROJECT_STRUCTURE.md      This map
│   ├── ARCHITECTURE.md           Data flows and application boundaries
│   └── UPGRADING.md              Old-layout migration and backup instructions
├── .github/workflows/ci.yml      Automated checks
├── .env.example                  Public configuration template; no real keys
├── .gitignore                    Dependencies, private state, caches, build output
├── .dockerignore                 Files excluded from the Docker build context
├── .prettierrc.json              JavaScript/TypeScript/CSS formatting rules
├── .prettierignore               Formatting exclusions
├── Dockerfile                    ONLY deployment image definition
├── docker-compose.yml            ONLY Compose configuration
├── package.json                  Root Node commands and dependencies
├── package-lock.json             Root npm dependency lock
├── playwright.config.ts          Browser test runner configuration
├── pyproject.toml                Python test discovery and lint rules
├── README.md                     Main setup and operation instructions
├── SECURITY.md                   Security boundaries and deployment checklist
└── LICENSE
```

Empty `__init__.py` files identify Python packages. Frontend unit tests remain beside their components/helpers; backend tests live in `backend/tests/`; browser tests live in `e2e/`. These are intentionally different test layers, not duplicate applications.

## Where to make changes

- **UI or page layout:** `frontend/src/pages/` and `frontend/src/components/`.
- **Browser API integration:** `frontend/src/lib/api.ts`, `types.ts`, and related helpers.
- **HTTP endpoints:** `backend/app/routes/` with matching backend tests.
- **Persistence or policy:** `backend/app/models.py`, `schemas.py`, `auth.py`, and services.
- **Startup or environment:** root `scripts/`, `backend/app/config.py`, and `.env.example`.
- **Deployment:** root Docker/Compose files only. The image still runs `app.main:app`; public API paths have not changed.

## Run commands from the root

All npm commands, dependency installation, lint commands, and the default pytest invocation run from the directory containing `package.json`, `pyproject.toml`, `backend/`, and `frontend/`. The Python virtual environment is root `.venv/`; do not mix its contents into application source.

The backend's working directory is `backend/`. Its default private state is `backend/data/`, and its built frontend is root `frontend/dist/`. Explicit `DATA_DIR`, `DATABASE_URL`, and `STATIC_DIR` settings remain supported. Docker keeps its existing `/app` application layout and persistent `/data` volume.

## Upgrading an old checkout

Git relocates tracked source files, **not ignored databases or encryption keys**. Stop the old app and follow [UPGRADING.md](UPGRADING.md). Never create a new key file and copy only the old database: the database, ciphertext objects, and original encryption key must stay together.

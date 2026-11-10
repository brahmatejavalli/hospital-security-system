# Architecture

## Source boundaries

Python application code and tests live in `backend/`; the React application and colocated unit tests live in `frontend/`. Root `scripts/` coordinates the two services, and `e2e/` owns cross-application browser tests. Node dependencies, Python test configuration, and the single Docker/Compose deployment stay at the root. See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the full file map.

The development launcher runs the API with `backend/` as its working directory. Configuration locates root `.env` and `frontend/dist/` from the repository, while default private state lives in ignored `backend/data/`. The Docker runtime remains `/app` with persistent `/data`. A guarded [layout upgrade](UPGRADING.md) preserves old private state instead of silently generating a different encryption key.

## Components

```text
Browser
  React + TypeScript + React Query + local fonts
         │ same-origin /api requests; HttpOnly session cookie
         ▼
Vite development proxy OR FastAPI's built static application
         ▼
FastAPI
  Body bound → host/CSRF checks → account/JWT → role policy → route
       │                      │
       ▼                      ▼
SQLAlchemy database     AES-256-GCM ciphertext
  accounts              private local objects
  record metadata       OR private AWS S3 objects
  audit events
  alerts/settings
```

- `npm run dev` starts both development services. Browser code only calls relative `/api` URLs; it never tries to reach the user’s `localhost` for a separate backend.
- Production uses the root multi-stage Dockerfile. Vite builds the frontend; FastAPI serves its assets and SPA fallback on the same origin as the API.
- There is no mandatory cloud connection. The default SQLite database and encrypted local objects persist in an ignored private directory. MySQL support is available through PyMySQL; live external-service integration must be tested in deployment.

## Record upload

1. Authentication checks the account, expiry, and token version; upload requires an appropriate role.
2. The complete request is size-bounded before form parsing. Patient reference, category, department, classification, extension, and basic byte signature/encoding are validated. Nurses cannot upload Restricted content.
3. Generate a record UUID, a new random GCM nonce, and the SHA3-256 plaintext checksum.
4. Encrypt contents with the configured 32-byte key and UUID as additional authenticated data.
5. Write only the versioned encrypted envelope to a private local path or S3 object.
6. Commit metadata and an audit event. If metadata persistence fails, attempt to remove the orphaned ciphertext.

## Authorized download

1. Load the account and record. Administrators and doctors can download all classifications. Nurses can download Internal/Confidential only; auditors cannot download contents.
2. A policy rejection produces a blocked audit event and an alert.
3. Read ciphertext, authenticate/decrypt it using the record UUID, then compare its plaintext checksum with a constant-time check.
4. Integrity failure blocks the response, marks the record, and records an alert/event. Success records a download event and returns a `no-store`, attachment-only response.
5. The browser saves the downloaded blob using a short-lived object URL.

A metadata detail retrieval is audited independently. The list and search APIs return metadata to all authenticated roles by design; those APIs never contain encrypted envelopes, storage paths, passwords, signing keys, or file plaintext.

## Accounts and sessions

The browser bootstraps public configuration, then the current session. In a development demo only, an unauthenticated tab automatically requests the explicitly enabled demo session. A sign-out flag in sessionStorage prevents immediate demo re-entry; it is **not a token or authorization mechanism**.

Login issues an expiring JWT in an HttpOnly cookie and returns a bearer token for API integrations. The frontend ignores the response token. Every authenticated request checks the stored user’s active state and token version. Password/access changes and sign-out increment the version, revoking older tokens. Workspace session-lifetime settings affect new sessions, not already-issued token expirations.

Administrators add members and can reset passwords for non-demo, non-self accounts. Account deactivation retains uploaded records and audit history. Administrator self-demotion/deactivation is rejected. Profile name changes are separate from role management. There is no public account-registration endpoint.

## Dashboard, dates, and alerts

- Dashboard values are database queries, not frontend mock data. Reporting windows are selectable; charts and “today” aggregate by **UTC day**. Record/event timestamps display in the chosen workspace IANA timezone.
- Historical sample events are explicitly marked synthetic. The demo’s records are valid downloadable PDFs that identify themselves as synthetic data.
- Application-generated alerts cover the documented sign-in, access-denial, and integrity rules. Other example alert patterns are samples, not a claimed external monitoring capability.
- The bell lists open alerts; it is not an unread-email or push-notification system.
- Resolving an alert updates its review metadata and appends an audit event. The security heuristic is recalculated from current open alerts and integrity flags.
- CSV exports are generated by the server, permission-checked, `no-store`, and spreadsheet-injection-safe. Audit exports apply active filters and cap output at 10,000 rows.

## Frontend behavior

React Query caches results, polls the overview/alerts every 30 seconds, and invalidates relevant lists/metrics after writes. Searches are debounced. Routes support deep links to a record, an alert review, staff searches, audit filters, and settings sections. Protected navigation is hidden for unsupported roles, but actual authorization remains entirely server-side.

Dialogs restore focus, trap keyboard focus, support Escape, and close on backdrop interaction. Native form controls have associated labels. Toasts are announced politely. Data tables support horizontal scrolling on narrow screens without making the page overflow. Chart totals and an accessible SVG description provide text context for the visual series.

## Testing and limits

- Backend tests use a dedicated temporary database/data directory, never the development workspace.
- Frontend tests cover API behavior, formatting, upload forms, errors, dialogs, notifications, and pagination.
- Playwright launches a separate temporary demo on ports 5174/8001, runs real browser workflows and automated WCAG checks, then tears it down.
- SQLite/single-instance local storage is the default deployment, not a claim of high availability. Audit data is append-only at the application API level, not immutable against database administrators. Key rotation, schema/object migration, external alert delivery, SSO/MFA, malware quarantine, and compliance processes are deployment/extensions work, not simulated features.

See [SECURITY.md](../SECURITY.md) for the full threat boundaries and deployment checklist.

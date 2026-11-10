# Frontend · MedGuard workspace

The React/TypeScript application lives entirely in this directory. Node dependencies and commands are intentionally managed by the **single root `package.json` and `package-lock.json`**; do not run a second npm installation here.

## Contents

| Path | Responsibility |
| --- | --- |
| `src/pages/` | Overview, vault, staff, audit, alerts, settings, and sign-in screens |
| `src/components/` | Shared navigation, dialogs, record controls, charts, and UI primitives |
| `src/lib/` | Typed API requests, authentication, query helpers, hooks, types, and formatting |
| `src/*.css` | Shared responsive styles and print styles |
| `src/**/*.test.*` | Unit/component tests alongside the code they cover |
| `public/` | Public static assets such as the favicon |
| `index.html` | Application HTML entrypoint |
| `vite.config.ts`, `tsconfig.json` | Frontend development, test, and TypeScript configuration |
| `dist/` | Generated production build; **ignored by Git** |

## Commands

Run these from the **repository root**:

```bash
npm ci
npm run dev           # FastAPI + Vite, requires the root Python .venv
npm run dev:frontend  # Vite only; start the API separately on port 8000
npm test
npm run build
```

In Windows PowerShell, use `npm.cmd` instead of `npm` if script execution is restricted. No virtual-environment activation is required.

The frontend calls relative `/api` URLs. Vite proxies them to the API; production serves the built application and API together. Do not add browser-facing `localhost:8000` URLs or frontend secrets.

See the [root README](../README.md) for setup and [project structure](../docs/PROJECT_STRUCTURE.md) for file ownership. Real-browser tests live in root `e2e/` and use a disposable database.

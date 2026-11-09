import logging
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import text

from app.config import PRODUCTION, STATIC_DIR, TRUSTED_HOSTS
from app.database import Base, SessionLocal, engine
from app.middleware import RequestSizeLimitMiddleware
from app.routes.file_routes import router as file_router, upload_file
from app.routes.user_routes import router as user_router, create_staff, login
from app.routes.workspace_routes import router as workspace_router
from app.seed import initialize_workspace

logger = logging.getLogger("medguard")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        initialize_workspace(db)
    yield
    engine.dispose()


app = FastAPI(
    title="MedGuard · Hospital Security API",
    version="1.0.0",
    description="Authenticated hospital records, encrypted storage, role-based access, and an append-only application audit trail. Mutations require X-Requested-With: MedGuard or a same-origin Origin header.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    is_api = request.url.path.startswith(("/api/", "/user/", "/file/"))
    if is_api and request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        same_origin = bool(origin and urlparse(origin).netloc == request.headers.get("host"))
        if (origin and not same_origin) or (
            not same_origin and request.headers.get("x-requested-with") != "MedGuard"
        ):
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Cross-site request blocked. Send X-Requested-With: MedGuard from an authorized client."
                },
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if is_api:
        response.headers["Cache-Control"] = "no-store"
    elif PRODUCTION:
        # frame-ancestors is intentionally omitted to support Arena's embedded preview.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
        )
    if PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(RequestSizeLimitMiddleware)
if PRODUCTION:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error("Unhandled server error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on the server. Please retry or contact your administrator."
        },
    )


app.include_router(user_router, prefix="/api", tags=["Accounts & access"])
app.include_router(file_router, prefix="/api", tags=["Encrypted records"])
app.include_router(workspace_router, prefix="/api", tags=["Workspace & security"])
# Existing integrations retain their paths, now with the same authentication and policies.
app.add_api_route("/user/login", login, methods=["POST"], deprecated=True, tags=["Legacy"])
app.add_api_route(
    "/user/register",
    create_staff,
    methods=["POST"],
    status_code=201,
    deprecated=True,
    tags=["Legacy"],
)
app.add_api_route(
    "/file/upload", upload_file, methods=["POST"], status_code=201, deprecated=True, tags=["Legacy"]
)


@app.get("/api/health", tags=["Health"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "medguard", "version": "1.0.0"}


if (STATIC_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path.startswith(("api/", "user/", "file/")):
        raise HTTPException(404, "API endpoint not found.")
    root = STATIC_DIR.resolve()
    candidate = (root / path).resolve()
    if candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    if (root / "index.html").is_file():
        return FileResponse(root / "index.html")
    return {
        "message": "MedGuard API is running. Start the frontend with npm run dev, or build it with npm run build.",
        "docs": "/api/docs",
    }

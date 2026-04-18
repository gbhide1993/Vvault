import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.rag import router as rag_router
from app.routes.cache_routes import router as cache_router
from app.routes.knowledge_routes import router as knowledge_router
from app.routes.auth_routes import router as auth_router
from app.middleware.auth import auth_middleware
from app.services.template_service import init_template_embeddings_once
from app.services.user_service import seed_admin_if_missing

logger = logging.getLogger(__name__)


def _read_version() -> str:
    for path in ("/app/VERSION", "VERSION"):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except OSError:
            pass
    return "unknown"


def check_required_env():
    db_password = os.getenv("DB_PASSWORD", "")
    jwt_secret = os.getenv("JWT_SECRET", "")
    if db_password in ("postgres", "change-this-db-password"):
        print("WARNING: DB_PASSWORD is set to a default/insecure value. "
              "Change it before deploying to production.")
    if not jwt_secret or jwt_secret == "change-this-secret-before-production":
        print("WARNING: JWT_SECRET is missing or insecure. "
              "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\" "
              "and set it in your .env file.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    check_required_env()
    seed_admin_if_missing()
    init_template_embeddings_once()

    try:
        import glob
        import time
        cutoff = time.time() - 7200
        for f in glob.glob("/tmp/*.xlsx"):
            try:
                if os.path.getmtime(f) < cutoff:
                    os.remove(f)
                    logger.info("Cleaned up stale tmp file: %s", f)
            except OSError as e:
                logger.error("Failed to delete tmp file %s: %s", f, e)
    except Exception as e:
        logger.error("Tmp cleanup failed: %s", e)

    from app.services.license_service import validate_license
    status = validate_license()
    if status["valid"]:
        logger.info("LICENSE: Valid — %s — expires %s (%s days remaining)",
                    status.get("company", ""), status["expires_at"], status["days_remaining"])
    else:
        logger.warning("LICENSE: %s — place your .vvault-license file in the Vvault folder",
                       status["reason"])
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(BaseHTTPMiddleware, dispatch=auth_middleware)

app.include_router(auth_router)
app.include_router(rag_router)
app.include_router(cache_router)
app.include_router(knowledge_router)


@app.get("/health")
def health():
    from app.services.license_service import get_license_status
    return {
        "status": "ok",
        "version": _read_version(),
        "license": get_license_status(),
    }

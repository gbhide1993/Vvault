import os
import logging
import asyncio

logging.basicConfig(level=logging.WARNING)

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


def check_required_env():
    db_password = os.getenv("DB_PASSWORD", "")
    jwt_secret = os.getenv("JWT_SECRET", "")

    if db_password in ("postgres", "change-this-db-password", "CHANGE_ME_BEFORE_RUNNING"):
        logging.warning(
            "DB_PASSWORD is set to a default/insecure value. "
            "Change it before deploying to production."
        )

    if not jwt_secret or jwt_secret in (
        "insecure-default-change-me",
        "change-this-secret-before-production",
        "CHANGE_ME_RUN_python_secrets_token_hex_32",
    ):
        raise RuntimeError(
            "JWT_SECRET is missing or insecure. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\" "
            "and set it in your .env file."
        )


ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "https://localhost:3443,http://localhost:3000"
).split(",")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
    return {"status": "ok", "version": "1.0.0"}


@app.on_event("startup")
async def startup():
    check_required_env()
    seed_admin_if_missing()

    from app.services.cache_db import check_db_health
    try:
        check_db_health()
    except Exception as e:
        logging.error(f"DB health check failed: {e}")

    from app.services.license_service import validate_license
    status = validate_license()
    if status["valid"]:
        logging.warning(
            f"LICENSE OK — {status.get('company','?')} — "
            f"expires {status.get('expires_at','?')} "
            f"({status.get('days_remaining','?')} days)"
        )
    else:
        logging.error(
            f"LICENSE INVALID — reason: {status.get('reason','?')} "
            f"— contact support@getvvault.com"
        )

    async def warmup_ollama():
        try:
            from app.services.embedding_service import generate_embedding
            generate_embedding("warmup")
            logging.warning("Ollama warmup complete.")
        except Exception as e:
            logging.warning(f"Ollama warmup failed (will retry on first request): {e}")

    asyncio.create_task(warmup_ollama())
    asyncio.create_task(asyncio.to_thread(init_template_embeddings_once))

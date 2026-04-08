from fastapi.responses import JSONResponse
from jose import jwt, JWTError
import os

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET environment variable is not set. Cannot start.")
ALGORITHM = "HS256"

SKIP_PATHS = {"/auth/login", "/docs", "/openapi.json", "/redoc", "/health"}


async def auth_middleware(request, call_next):
    if request.url.path in SKIP_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing Authorization header"})

    token = auth_header[len("Bearer "):]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        request.state.username = payload["sub"]
        request.state.role = payload["role"]
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    return await call_next(request)

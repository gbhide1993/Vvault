import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from jose import jwt, JWTError

from app.services.user_service import authenticate_user, is_default_password

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = os.getenv("JWT_SECRET", "insecure-default-change-me")
ALGORITHM = "HS256"
EXPIRY_HOURS = 12


class LoginRequest(BaseModel):
    username: str
    password: str


def create_token(username: str, role: str) -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


@router.post("/login")
async def login(body: LoginRequest):
    user = authenticate_user(body.username, body.password)
    if not user:
        return JSONResponse(status_code=401, content={"detail": "Invalid credentials"})
    token = create_token(user["username"], user["role"])
    requires_setup = user["role"] == "admin" and is_default_password()
    return {
        "token": token,
        "username": user["username"],
        "role": user["role"],
        "requires_setup": requires_setup,
    }


@router.get("/me")
def get_me(request: Request):
    username = getattr(request.state, "username", None)
    role = getattr(request.state, "role", None)

    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "username": username,
        "role": role
    }
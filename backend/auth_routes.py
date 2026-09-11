import hashlib
import os
import secrets
from datetime import datetime, timezone, timedelta

import httpx
import jwt
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from deps import (db, now_utc, hash_password, verify_password, create_access_token,
                  create_refresh_token, set_auth_cookies, public_user, get_current_user,
                  get_jwt_secret)
from email_service import send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
RESET_LIMIT_PER_EMAIL = 5
RESET_APP_LIMIT = 9


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    phone: str = ""
    role: str = "customer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=72)


def _trial_subscription() -> dict:
    days = int(os.environ.get("TRIAL_DAYS", "7"))
    return {"status": "trialing", "trial_ends_at": (now_utc() + timedelta(days=days)).isoformat(),
            "stripe_customer_id": None, "stripe_subscription_id": None, "current_period_end": None}


@router.post("/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower()
    if req.role not in ("customer", "owner"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email ja cadastrado")
    doc = {
        "email": email, "password_hash": hash_password(req.password), "name": req.name.strip(),
        "phone": req.phone.strip(), "role": req.role, "token_version": 0, "is_active": True,
        "created_at": now_utc().isoformat(),
    }
    if req.role == "owner":
        doc["subscription"] = _trial_subscription()
    result = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": result.inserted_id})
    access = create_access_token(str(result.inserted_id), email)
    refresh = create_refresh_token(str(result.inserted_id))
    set_auth_cookies(response, access, refresh)
    return public_user(user)


async def _check_lockout(identifier: str):
    cutoff = now_utc() - timedelta(minutes=LOCKOUT_MINUTES)
    attempts = await db.login_attempts.count_documents(
        {"identifier": identifier, "created_at": {"$gt": cutoff.isoformat()}})
    if attempts >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Tente novamente em 15 minutos.")


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    email = req.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    await _check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": identifier, "email": email,
                                            "created_at": now_utc().isoformat()})
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    if user.get("is_banned") or user.get("is_deleted") or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Conta suspensa ou banida")
    await db.login_attempts.delete_many({"identifier": identifier})
    uid = str(user["_id"])
    ver = user.get("token_version", 0)
    set_auth_cookies(response, create_access_token(uid, email, ver), create_refresh_token(uid, ver))
    return public_user(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"message": "ok"}


class GoogleSessionRequest(BaseModel):
    session_id: str
    role: str = "customer"


@router.post("/google/session")
async def google_session(req: GoogleSessionRequest, response: Response):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        role = req.role if req.role in ("customer", "owner") else "customer"
        doc = {
            "email": email, "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"), "phone": "", "role": role,
            "password_hash": None, "token_version": 0, "is_active": True,
            "auth_provider": "google", "created_at": now_utc().isoformat(),
        }
        if role == "owner":
            doc["subscription"] = _trial_subscription()
        res = await db.users.insert_one(doc)
        user = await db.users.find_one({"_id": res.inserted_id})
    else:
        await db.users.update_one({"_id": user["_id"]}, {"$set": {
            "name": data.get("name") or user.get("name"), "picture": data.get("picture")}})
        user = await db.users.find_one({"_id": user["_id"]})
    if user.get("is_banned") or user.get("is_deleted") or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Conta suspensa ou banida")
    session_token = data["session_token"]
    await db.user_sessions.delete_many({"session_token": session_token})
    await db.user_sessions.insert_one({
        "user_id": str(user["_id"]), "session_token": session_token,
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat()})
    response.set_cookie(key="session_token", value=session_token, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")
    return public_user(user)


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    access = create_access_token(str(user["_id"]), user["email"], user.get("token_version", 0))
    response.set_cookie(key="access_token", value=access, httponly=True, secure=True,
                        samesite="none", max_age=900, path="/")
    return {"message": "ok"}


@router.post("/forgot-password")
async def forgot_password(req: ForgotRequest, background_tasks: BackgroundTasks):
    email = req.email.lower()
    cutoff = now_utc() - timedelta(minutes=15)
    recent_email = await db.password_reset_requests.count_documents(
        {"email": email, "created_at": {"$gt": cutoff.isoformat()}})
    recent_app = await db.password_reset_requests.count_documents(
        {"created_at": {"$gt": (now_utc() - timedelta(minutes=10)).isoformat()}})
    if recent_email < RESET_LIMIT_PER_EMAIL and recent_app < RESET_APP_LIMIT:
        await db.password_reset_requests.insert_one({"email": email, "created_at": now_utc().isoformat()})
        user = await db.users.find_one({"email": email})
        if user:
            token = secrets.token_urlsafe(32)
            await db.password_reset_tokens.insert_one({
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "user_id": str(user["_id"]), "email": email,
                "expires_at": (now_utc() + timedelta(hours=1)).isoformat(), "used": False})
            background_tasks.add_task(send_password_reset_email, user["email"], token)
    return {"message": "Se esse e-mail estiver cadastrado, um link de redefinicao foi enviado."}


@router.post("/reset-password")
async def reset_password(req: ResetRequest):
    token_hash = hashlib.sha256(req.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": now_utc().isoformat()}},
        {"$set": {"used": True}})
    if not doc:
        raise HTTPException(status_code=400, detail="Link invalido ou expirado")
    await db.users.update_one({"_id": ObjectId(doc["user_id"])},
                              {"$set": {"password_hash": hash_password(req.password)},
                               "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Senha redefinida com sucesso"}

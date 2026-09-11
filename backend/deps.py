import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
LOCAL_TZ = ZoneInfo("America/Sao_Paulo")
PENDING_HOLD_MINUTES = 60


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": now_utc() + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": now_utc() + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True,
                        samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    u = {k: v for k, v in user.items() if k != "password_hash"}
    u["id"] = str(u.pop("_id"))
    return u


async def get_current_user(request: Request) -> dict:
    from bson import ObjectId
    token = request.cookies.get("access_token")
    bearer = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header[7:]
    if not token and bearer:
        token = bearer
    if token:
        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid token type")
            user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            if payload.get("ver", 0) != user.get("token_version", 0):
                raise HTTPException(status_code=401, detail="Session expired")
            return user
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    session_token = request.cookies.get("session_token") or bearer
    if session_token:
        sess = await db.user_sessions.find_one({"session_token": session_token})
        if sess:
            exp = sess["expires_at"]
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc():
                await db.user_sessions.delete_one({"session_token": session_token})
                raise HTTPException(status_code=401, detail="Session expired")
            user = await db.users.find_one({"_id": ObjectId(sess["user_id"])})
            if user:
                return user
    raise HTTPException(status_code=401, detail="Not authenticated")


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep


def subscription_valid(user: dict) -> bool:
    sub = user.get("subscription") or {}
    st = sub.get("status")
    if st == "active":
        return True
    if st == "trialing":
        te = sub.get("trial_ends_at")
        if te:
            te_dt = datetime.fromisoformat(te)
            if te_dt.tzinfo is None:
                te_dt = te_dt.replace(tzinfo=timezone.utc)
            return te_dt > now_utc()
    return False


def trial_days_left(user: dict) -> int:
    sub = user.get("subscription") or {}
    if sub.get("status") != "trialing":
        return 0
    te = sub.get("trial_ends_at")
    if not te:
        return 0
    te_dt = datetime.fromisoformat(te)
    if te_dt.tzinfo is None:
        te_dt = te_dt.replace(tzinfo=timezone.utc)
    return max(0, (te_dt - now_utc()).days + 1)


def owner_can_operate(user: dict) -> bool:
    return bool(user.get("is_active", True)) and subscription_valid(user)


async def notify(user_id: str, title: str, body: str):
    import uuid
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "title": title, "body": body,
        "read": False, "created_at": now_utc().isoformat(),
    })


def generate_slots(field: dict, date_str: str):
    date = datetime.strptime(date_str, "%Y-%m-%d").date()
    windows = (field.get("weekly_schedule") or {}).get(str(date.weekday()), [])
    dur = int(field.get("slot_duration_minutes", 60))
    slots = []
    for w in windows:
        sh, sm = map(int, w["start"].split(":"))
        eh, em = map(int, w["end"].split(":"))
        t, end = sh * 60 + sm, eh * 60 + em
        while t + dur <= end:
            slots.append({
                "start": f"{t // 60:02d}:{t % 60:02d}",
                "end": f"{(t + dur) // 60:02d}:{(t + dur) % 60:02d}",
                "price": float(w["price"]),
            })
            t += dur
    return slots


async def get_slot_statuses(field: dict, date_str: str):
    slots = generate_slots(field, date_str)
    if not slots:
        return []
    bookings = await db.bookings.find(
        {"field_id": field["id"], "date": date_str,
         "status": {"$in": ["pending_payment", "confirmed"]}}).to_list(500)
    taken, stale_ids = {}, []
    for b in bookings:
        if b["status"] == "pending_payment":
            created = datetime.fromisoformat(b["created_at"])
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if (now_utc() - created) > timedelta(minutes=PENDING_HOLD_MINUTES):
                stale_ids.append(b["id"])
                continue
        taken[b["start_time"]] = b
    if stale_ids:
        await db.bookings.delete_many({"id": {"$in": stale_ids}})
    blocks = await db.blocks.find({"field_id": field["id"], "date": date_str}, {"_id": 0}).to_list(200)
    local_now = now_utc().astimezone(LOCAL_TZ)
    today = local_now.date().isoformat()
    now_hm = local_now.strftime("%H:%M")
    out = []
    for s in slots:
        status, booking = "available", None
        if date_str < today or (date_str == today and s["start"] <= now_hm):
            status = "past"
        elif s["start"] in taken:
            status, booking = "booked", taken[s["start"]]
        else:
            for bl in blocks:
                if bl["start_time"] < s["end"] and s["start"] < bl["end_time"]:
                    status = "blocked"
                    break
        out.append({**s, "status": status, "booking": booking})
    return out

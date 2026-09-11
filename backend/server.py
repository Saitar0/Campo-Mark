from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from datetime import timedelta

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from deps import db, now_utc, hash_password, verify_password
from auth_routes import router as auth_router
from field_routes import router as field_router
from booking_routes import router as booking_router
from payment_routes import router as payment_router
from admin_routes import router as admin_router

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="CampoMark")

app.include_router(auth_router)
app.include_router(field_router)
app.include_router(booking_router)
app.include_router(payment_router)
app.include_router(admin_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api")
async def root():
    return {"message": "CampoMark API"}


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "email": email, "password_hash": hash_password(password), "name": "Admin CampoMark",
            "phone": "", "role": "admin", "token_version": 0, "is_active": True,
            "created_at": now_utc().isoformat()})
        logger.info("Admin seeded: %s", email)
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


DEMO_PHOTOS = {
    "society": [
        "https://images.unsplash.com/photo-1517747614396-d21a78b850e8?crop=entropy&cs=srgb&fm=jpg&q=85",
        "https://images.unsplash.com/photo-1580920659896-7e8663eb956a?crop=entropy&cs=srgb&fm=jpg&q=85",
        "https://images.unsplash.com/photo-1647118868186-70d38e10b0dc?crop=entropy&cs=srgb&fm=jpg&q=85",
    ],
    "futsal": [
        "https://images.unsplash.com/photo-1763775468707-573c7cd6b0da?crop=entropy&cs=srgb&fm=jpg&q=85",
        "https://images.unsplash.com/photo-1712325485668-6b6830ba814e?crop=entropy&cs=srgb&fm=jpg&q=85",
    ],
    "campo": [
        "https://images.unsplash.com/photo-1716745559715-282bb61e3012?crop=entropy&cs=srgb&fm=jpg&q=85",
        "https://images.unsplash.com/photo-1652190416554-c46af8a0ff50?crop=entropy&cs=srgb&fm=jpg&q=85",
    ],
}


async def seed_demo():
    import uuid
    if await db.users.find_one({"email": "dono@campomark.com"}):
        return
    trial_days = int(os.environ.get("TRIAL_DAYS", "7"))
    owner = {
        "email": "dono@campomark.com", "password_hash": hash_password("demo12345"),
        "name": "Carlos Arena", "phone": "+5511999990001", "role": "owner",
        "token_version": 0, "is_active": True, "created_at": now_utc().isoformat(),
        "subscription": {"status": "trialing",
                         "trial_ends_at": (now_utc() + timedelta(days=trial_days)).isoformat(),
                         "stripe_customer_id": None, "stripe_subscription_id": None,
                         "current_period_end": None},
    }
    res = await db.users.insert_one(owner)
    owner_id = str(res.inserted_id)
    weekday = [
        {"start": "08:00", "end": "17:00", "price": 120.0},
        {"start": "17:00", "end": "23:00", "price": 180.0},
    ]
    weekend = [{"start": "08:00", "end": "23:00", "price": 150.0}]
    schedule = {str(i): weekday for i in range(5)}
    schedule["5"] = weekend
    schedule["6"] = weekend
    futsal_weekday = [
        {"start": "09:00", "end": "18:00", "price": 100.0},
        {"start": "18:00", "end": "23:00", "price": 140.0},
    ]
    futsal_schedule = {str(i): futsal_weekday for i in range(5)}
    futsal_schedule["5"] = [{"start": "09:00", "end": "22:00", "price": 130.0}]
    futsal_schedule["6"] = [{"start": "09:00", "end": "20:00", "price": 130.0}]
    fields = [
        {
            "id": str(uuid.uuid4()), "owner_id": owner_id, "owner_name": "Carlos Arena",
            "name": "Arena Bola de Ouro", "field_type": "society",
            "description": "Society com grama sintetica de ultima geracao, iluminacao LED e vestiarios completos.",
            "address": "Rua das Palmeiras, 450", "city": "Sao Paulo", "neighborhood": "Moema",
            "photos": DEMO_PHOTOS["society"],
            "amenities": ["bola", "coletes", "iluminacao", "vestiario", "estacionamento", "bar"],
            "slot_duration_minutes": 60, "weekly_schedule": schedule,
            "cancel_hours": 24, "refund_percent": 50,
            "accept_online": True, "accept_on_site": True,
            "active": True, "created_at": now_utc().isoformat(),
        },
        {
            "id": str(uuid.uuid4()), "owner_id": owner_id, "owner_name": "Carlos Arena",
            "name": "Futsal Show de Bola", "field_type": "futsal",
            "description": "Quadra de futsal coberta com piso profissional, arquibancada e lanches.",
            "address": "Av. Sete de Setembro, 1200", "city": "Curitiba", "neighborhood": "Batel",
            "photos": DEMO_PHOTOS["futsal"],
            "amenities": ["bola", "coletes", "vestiario", "arbitragem", "bar"],
            "slot_duration_minutes": 60, "weekly_schedule": futsal_schedule,
            "cancel_hours": 12, "refund_percent": 100,
            "accept_online": True, "accept_on_site": True,
            "active": True, "created_at": now_utc().isoformat(),
        },
        {
            "id": str(uuid.uuid4()), "owner_id": owner_id, "owner_name": "Carlos Arena",
            "name": "Campo do Vila Rica", "field_type": "campo",
            "description": "Campo aberto de grama natural para 11x11, ideal para peladas de fim de semana.",
            "address": "Estrada Velha, 88", "city": "Sao Paulo", "neighborhood": "Vila Rica",
            "photos": DEMO_PHOTOS["campo"],
            "amenities": ["vestiario", "estacionamento", "churrasqueira"],
            "slot_duration_minutes": 90, "weekly_schedule": schedule,
            "cancel_hours": 24, "refund_percent": 100,
            "accept_online": True, "accept_on_site": True,
            "active": True, "created_at": now_utc().isoformat(),
        },
    ]
    await db.fields.insert_many(fields)
    await db.users.insert_one({
        "email": "jogador@campomark.com", "password_hash": hash_password("demo12345"),
        "name": "Joao Jogador", "phone": "+5511999990002", "role": "customer",
        "token_version": 0, "is_active": True, "created_at": now_utc().isoformat()})
    logger.info("Demo data seeded")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.login_attempts.create_index("email")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_requests.create_index("email")
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await db.fields.create_index("owner_id")
    await db.fields.create_index([("city", 1), ("active", 1)])
    await db.bookings.create_index(
        [("field_id", 1), ("date", 1), ("start_time", 1)], unique=True,
        partialFilterExpression={"status": {"$in": ["pending_payment", "confirmed"]}},
        name="uniq_active_slot")
    await db.bookings.create_index([("customer_id", 1), ("date", -1)])
    await db.bookings.create_index([("owner_id", 1), ("date", -1)])
    await db.blocks.create_index([("field_id", 1), ("date", 1)])
    await db.notifications.create_index("user_id")
    await db.payment_transactions.create_index("session_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.files.create_index("storage_path", unique=True)
    await db.audit_logs.create_index("created_at")
    await db.fields.update_many({"currency": {"$exists": False}},
                                {"$set": {"country": "BR", "currency": "brl", "hidden": False}})
    await db.bookings.update_many({"currency": {"$exists": False}}, {"$set": {"currency": "brl"}})
    await db.bookings.update_many({"payment_method": "on_site", "payment_status": "on_site"},
                                  {"$set": {"payment_status": "pending_on_site"}})
    try:
        from storage_service import init_storage
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Storage init failed: %s", e)
    await seed_admin()
    await seed_demo()


@app.on_event("shutdown")
async def shutdown_db_client():
    from deps import client
    client.close()

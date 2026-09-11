import os
import uuid
from datetime import datetime, timezone

import stripe
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response as FileResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from deps import (db, now_utc, require_role, get_current_user, get_slot_statuses, notify, LOCAL_TZ)
from email_service import (send_booking_confirmation_customer, send_booking_notification_owner,
                           send_booking_cancelled)
from whatsapp_service import send_whatsapp, booking_message
from storage_service import put_object, get_object

ALLOWED_RECEIPT_TYPES = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
}
MAX_RECEIPT_SIZE = 5 * 1024 * 1024

router = APIRouter(prefix="/api", tags=["bookings"])
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"


class BookingCreate(BaseModel):
    field_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    payment_method: str  # "online" | "on_site"


def serialize_booking(b: dict) -> dict:
    b.pop("_id", None)
    return b


async def _notify_new_booking(booking: dict):
    customer = await db.users.find_one({"_id": ObjectId(booking["customer_id"])})
    owner = await db.users.find_one({"_id": ObjectId(booking["owner_id"])})
    if customer:
        await send_booking_confirmation_customer(customer, booking)
        await send_whatsapp(customer.get("phone", ""), booking_message(booking, "Reserva confirmada no CampoMark!"))
    if owner:
        await send_booking_notification_owner(owner, booking)
        await notify(booking["owner_id"], "Nova reserva",
                     f"{booking['customer_name']} reservou {booking['field_name']} em "
                     f"{booking['date']} as {booking['start_time']}")
        await send_whatsapp(owner.get("phone", ""), booking_message(booking, "Nova reserva recebida!"))


@router.post("/bookings")
async def create_booking(payload: BookingCreate, background_tasks: BackgroundTasks,
                         user: dict = Depends(require_role("customer"))):
    from deps import owner_can_operate
    f = await db.fields.find_one({"id": payload.field_id, "active": True})
    if not f:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    owner = await db.users.find_one({"_id": ObjectId(f["owner_id"])})
    if not owner or not owner_can_operate(owner):
        raise HTTPException(status_code=400, detail="Campo indisponivel no momento")
    if payload.payment_method not in ("online", "on_site"):
        raise HTTPException(status_code=400, detail="Forma de pagamento invalida")
    if payload.payment_method == "online" and not f.get("accept_online", True):
        raise HTTPException(status_code=400, detail="Pagamento online nao aceito neste campo")
    if payload.payment_method == "on_site" and not f.get("accept_on_site", True):
        raise HTTPException(status_code=400, detail="Pagamento no local nao aceito neste campo")

    slots = await get_slot_statuses(f, payload.date)
    slot = next((s for s in slots if s["start"] == payload.start_time), None)
    if not slot:
        raise HTTPException(status_code=400, detail="Horario inexistente na grade deste campo")
    if slot["status"] != "available":
        raise HTTPException(status_code=409, detail="Horario indisponivel")

    online = payload.payment_method == "online"
    doc = {
        "id": str(uuid.uuid4()), "field_id": f["id"], "owner_id": f["owner_id"],
        "customer_id": str(user["_id"]), "customer_name": user.get("name", ""),
        "customer_phone": user.get("phone", ""), "customer_email": user.get("email", ""),
        "field_name": f["name"], "field_address": f.get("address", ""), "field_city": f.get("city", ""),
        "date": payload.date, "start_time": slot["start"], "end_time": slot["end"],
        "price": slot["price"], "currency": f.get("currency", "brl"),
        "status": "pending_payment" if online else "confirmed",
        "payment_method": payload.payment_method,
        "payment_status": "pending" if online else "pending_on_site",
        "receipt": None,
        "created_at": now_utc().isoformat(),
    }
    try:
        await db.bookings.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Horario acabou de ser reservado por outra pessoa")
    if not online:
        background_tasks.add_task(_notify_new_booking, doc)
    return serialize_booking(doc)


@router.get("/bookings/mine")
async def my_bookings(user: dict = Depends(require_role("customer"))):
    bookings = await db.bookings.find({"customer_id": str(user["_id"])}).sort(
        [("date", -1), ("start_time", -1)]).to_list(300)
    return [serialize_booking(b) for b in bookings]


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, background_tasks: BackgroundTasks,
                         user: dict = Depends(require_role("customer"))):
    b = await db.bookings.find_one({"id": booking_id, "customer_id": str(user["_id"])})
    if not b:
        raise HTTPException(status_code=404, detail="Reserva nao encontrada")
    if b["status"] == "canceled":
        raise HTTPException(status_code=400, detail="Reserva ja cancelada")
    f = await db.fields.find_one({"id": b["field_id"]})
    refund_amount = 0
    if b.get("payment_status") == "paid" and b.get("stripe_payment_intent_id"):
        start_dt = datetime.strptime(f"{b['date']} {b['start_time']}", "%Y-%m-%d %H:%M").replace(tzinfo=LOCAL_TZ)
        hours_until = (start_dt - now_utc().astimezone(LOCAL_TZ)).total_seconds() / 3600
        cancel_hours = (f or {}).get("cancel_hours", 24)
        refund_percent = (f or {}).get("refund_percent", 100)
        if hours_until >= cancel_hours and refund_percent > 0:
            refund_amount = int(round(b["price"] * refund_percent / 100 * 100))
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "canceled", "canceled_by": "customer", "canceled_at": now_utc().isoformat(),
        "payment_status": "refunded" if refund_amount else b.get("payment_status")}})
    if refund_amount:
        try:
            stripe.Refund.create(payment_intent=b["stripe_payment_intent_id"], amount=refund_amount)
        except stripe.error.StripeError:
            pass
    b["status"] = "canceled"
    owner = await db.users.find_one({"_id": ObjectId(b["owner_id"])})
    background_tasks.add_task(send_booking_cancelled, user, b, False)
    if owner:
        background_tasks.add_task(send_booking_cancelled, owner, b, False)
        await notify(b["owner_id"], "Reserva cancelada",
                     f"{b['customer_name']} cancelou {b['field_name']} em {b['date']} as {b['start_time']}")
    return {"message": "Reserva cancelada", "refunded": refund_amount / 100}


@router.get("/owner/bookings")
async def owner_bookings(date_from: str = None, date_to: str = None, field_id: str = None,
                         user: dict = Depends(require_role("owner"))):
    query = {"owner_id": str(user["_id"])}
    if field_id:
        query["field_id"] = field_id
    if date_from or date_to:
        query["date"] = {}
        if date_from:
            query["date"]["$gte"] = date_from
        if date_to:
            query["date"]["$lte"] = date_to
    bookings = await db.bookings.find(query).sort([("date", -1), ("start_time", -1)]).to_list(500)
    return [serialize_booking(b) for b in bookings]


@router.post("/owner/bookings/{booking_id}/cancel")
async def owner_cancel_booking(booking_id: str, background_tasks: BackgroundTasks,
                               user: dict = Depends(require_role("owner"))):
    b = await db.bookings.find_one({"id": booking_id, "owner_id": str(user["_id"])})
    if not b:
        raise HTTPException(status_code=404, detail="Reserva nao encontrada")
    if b["status"] == "canceled":
        raise HTTPException(status_code=400, detail="Reserva ja cancelada")
    await db.bookings.update_one({"id": booking_id}, {"$set": {
        "status": "canceled", "canceled_by": "owner", "canceled_at": now_utc().isoformat(),
        "payment_status": "refunded" if b.get("payment_status") == "paid" else b.get("payment_status")}})
    if b.get("payment_status") == "paid" and b.get("stripe_payment_intent_id"):
        try:
            stripe.Refund.create(payment_intent=b["stripe_payment_intent_id"])
        except stripe.error.StripeError:
            pass
    b["status"] = "canceled"
    customer = await db.users.find_one({"_id": ObjectId(b["customer_id"])})
    if customer:
        background_tasks.add_task(send_booking_cancelled, customer, b, True)
        await notify(b["customer_id"], "Reserva cancelada pelo campo",
                     f"Sua reserva em {b['field_name']} ({b['date']} {b['start_time']}) foi cancelada.")
    return {"message": "Reserva cancelada"}


@router.get("/owner/revenue")
async def owner_revenue(month: str, user: dict = Depends(require_role("owner"))):
    if len(month) != 7:
        raise HTTPException(status_code=400, detail="Formato de mes invalido (YYYY-MM)")
    bookings = await db.bookings.find({
        "owner_id": str(user["_id"]), "status": "confirmed",
        "date": {"$regex": f"^{month}"}}).to_list(1000)
    total = sum(b["price"] for b in bookings)
    by_method = {}
    by_day = {}
    for b in bookings:
        m = b.get("payment_method", "online")
        by_method[m] = by_method.get(m, 0) + b["price"]
        by_day[b["date"]] = by_day.get(b["date"], 0) + b["price"]
    return {"month": month, "total": total, "count": len(bookings),
            "by_method": by_method,
            "by_day": [{"date": k, "total": v} for k, v in sorted(by_day.items())],
            "bookings": [serialize_booking(b) for b in bookings]}


@router.get("/notifications")
async def my_notifications(user: dict = Depends(require_role("owner", "customer"))):
    notifs = await db.notifications.find({"user_id": str(user["_id"])}, {"_id": 0}).sort(
        "created_at", -1).to_list(50)
    return notifs


@router.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(require_role("owner", "customer"))):
    await db.notifications.update_many({"user_id": str(user["_id"])}, {"$set": {"read": True}})
    return {"message": "ok"}


@router.post("/owner/bookings/{booking_id}/mark-paid")
async def mark_booking_paid(booking_id: str, user: dict = Depends(require_role("owner"))):
    b = await db.bookings.find_one({"id": booking_id, "owner_id": str(user["_id"])})
    if not b:
        raise HTTPException(status_code=404, detail="Reserva nao encontrada")
    if b["status"] != "confirmed" or b.get("payment_method") != "on_site":
        raise HTTPException(status_code=400, detail="Reserva nao elegivel")
    if b.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Reserva ja marcada como paga")
    await db.bookings.update_one({"id": booking_id},
                                 {"$set": {"payment_status": "paid", "paid_at": now_utc().isoformat()}})
    await notify(b["customer_id"], "Pagamento confirmado",
                 f"O campo {b['field_name']} confirmou seu pagamento da reserva de {b['date']} as {b['start_time']}.")
    return {"message": "ok", "payment_status": "paid"}


async def _get_booking_for_receipt(booking_id: str, user: dict) -> dict:
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Reserva nao encontrada")
    uid = str(user["_id"])
    if user.get("role") != "admin" and uid not in (b["customer_id"], b["owner_id"]):
        raise HTTPException(status_code=403, detail="Forbidden")
    return b


@router.get("/bookings/{booking_id}/receipt")
async def get_receipt_info(booking_id: str, user: dict = Depends(get_current_user)):
    b = await _get_booking_for_receipt(booking_id, user)
    return {"receipt": b.get("receipt")}


@router.post("/bookings/{booking_id}/receipt-upload")
async def upload_receipt(booking_id: str, file: UploadFile = File(...),
                         user: dict = Depends(get_current_user)):
    b = await _get_booking_for_receipt(booking_id, user)
    content_type = file.content_type or ""
    if content_type not in ALLOWED_RECEIPT_TYPES:
        raise HTTPException(status_code=400, detail="Formato invalido. Use JPG, PNG, WEBP ou PDF.")
    data = await file.read()
    if len(data) > MAX_RECEIPT_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo muito grande (max 5MB)")
    ext = ALLOWED_RECEIPT_TYPES[content_type]
    path = f"campomark/receipts/{booking_id}/{uuid.uuid4()}.{ext}"
    import asyncio
    result = await asyncio.to_thread(put_object, path, data, content_type)
    receipt = {"kind": "upload", "path": result["path"], "filename": file.filename,
               "content_type": content_type, "uploaded_by": str(user["_id"]),
               "uploaded_at": now_utc().isoformat()}
    await db.bookings.update_one({"id": booking_id}, {"$set": {"receipt": receipt}})
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": result["path"],
        "original_filename": file.filename, "content_type": content_type,
        "size": result.get("size"), "booking_id": booking_id, "is_deleted": False,
        "created_at": now_utc().isoformat()})
    return {"receipt": receipt}


@router.get("/bookings/{booking_id}/receipt-file")
async def download_receipt(booking_id: str, user: dict = Depends(get_current_user)):
    b = await _get_booking_for_receipt(booking_id, user)
    receipt = b.get("receipt")
    if not receipt or receipt.get("kind") != "upload":
        raise HTTPException(status_code=404, detail="Comprovante nao encontrado")
    import asyncio
    data, content_type = await asyncio.to_thread(get_object, receipt["path"])
    return FileResponse(content=data, media_type=receipt.get("content_type", content_type))

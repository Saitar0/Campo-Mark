from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from deps import (db, now_utc, require_role, subscription_valid, trial_days_left,
                  audit, notify, currency_for_country)
from field_routes import FieldPayload, serialize_field
from email_service import send_owner_warning

router = APIRouter(prefix="/api/admin", tags=["admin"])

SUBSCRIPTION_PRICE_BRL = 149.0


@router.get("/metrics")
async def metrics(user: dict = Depends(require_role("admin"))):
    owners = await db.users.find({"role": "owner"}).to_list(1000)
    active_subs = sum(1 for o in owners if (o.get("subscription") or {}).get("status") == "active")
    trialing = sum(1 for o in owners if subscription_valid(o) and (o.get("subscription") or {}).get("status") == "trialing")
    past_due = sum(1 for o in owners if (o.get("subscription") or {}).get("status") == "past_due")
    month = now_utc().strftime("%Y-%m")
    bookings_month = await db.bookings.count_documents({"date": {"$regex": f"^{month}"}, "status": "confirmed"})
    fields_total = await db.fields.count_documents({"active": True})
    pipeline = [{"$match": {"date": {"$regex": f"^{month}"}, "status": "confirmed"}},
                {"$group": {"_id": None, "total": {"$sum": "$price"}}}]
    gmv = 0
    async for row in db.bookings.aggregate(pipeline):
        gmv = row["total"]
    return {"owners_total": len(owners), "subscriptions_active": active_subs,
            "subscriptions_trialing": trialing, "subscriptions_past_due": past_due,
            "fields_total": fields_total, "bookings_month": bookings_month,
            "gmv_month": gmv, "mrr": active_subs * SUBSCRIPTION_PRICE_BRL}


def owner_summary(o: dict, fields_count: int = 0, bookings_count: int = 0) -> dict:
    sub = o.get("subscription") or {}
    account_status = "active"
    if o.get("is_deleted"):
        account_status = "deleted"
    elif o.get("is_banned"):
        account_status = "banned"
    elif not o.get("is_active", True):
        account_status = "suspended"
    return {
        "id": str(o["_id"]), "name": o.get("name"), "email": o.get("email"),
        "phone": o.get("phone", ""), "is_active": o.get("is_active", True),
        "account_status": account_status,
        "created_at": o.get("created_at"),
        "subscription_status": sub.get("status", "none"),
        "subscription_valid": subscription_valid(o),
        "trial_days_left": trial_days_left(o),
        "current_period_end": sub.get("current_period_end"),
        "fields_count": fields_count, "bookings_count": bookings_count,
    }


@router.get("/owners")
async def list_owners(user: dict = Depends(require_role("admin"))):
    owners = await db.users.find({"role": "owner"}).sort("created_at", -1).to_list(1000)
    out = []
    for o in owners:
        oid = str(o["_id"])
        fields_count = await db.fields.count_documents({"owner_id": oid, "active": True})
        bookings_count = await db.bookings.count_documents({"owner_id": oid, "status": "confirmed"})
        out.append(owner_summary(o, fields_count, bookings_count))
    return out


@router.get("/owners/{owner_id}/detail")
async def owner_detail(owner_id: str, user: dict = Depends(require_role("admin"))):
    owner = await db.users.find_one({"_id": ObjectId(owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    fields = await db.fields.find({"owner_id": owner_id, "active": True}).to_list(100)
    bookings = await db.bookings.find({"owner_id": owner_id}).sort(
        [("date", -1), ("start_time", -1)]).to_list(100)
    month = now_utc().strftime("%Y-%m")
    month_bookings = [b for b in bookings if b["status"] == "confirmed" and b["date"].startswith(month)]
    for b in bookings:
        b.pop("_id", None)
    return {
        "owner": owner_summary(owner, len(fields), len(bookings)),
        "fields": [serialize_field(f) for f in fields],
        "bookings": bookings[:50],
        "revenue_month": {"month": month, "total": sum(b["price"] for b in month_bookings),
                          "count": len(month_bookings)},
    }


@router.post("/owners/{owner_id}/toggle")
async def toggle_owner(owner_id: str, user: dict = Depends(require_role("admin"))):
    owner = await db.users.find_one({"_id": ObjectId(owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    new_state = not owner.get("is_active", True)
    await db.users.update_one({"_id": owner["_id"]}, {"$set": {"is_active": new_state}})
    await audit(user, "owner_suspend" if not new_state else "owner_activate", "owner", owner_id)
    return {"is_active": new_state}


class OwnerProfileUpdate(BaseModel):
    name: str
    phone: str = ""


@router.put("/owners/{owner_id}")
async def update_owner_profile(owner_id: str, payload: OwnerProfileUpdate,
                               user: dict = Depends(require_role("admin"))):
    res = await db.users.update_one({"_id": ObjectId(owner_id), "role": "owner"},
                                    {"$set": {"name": payload.name.strip(), "phone": payload.phone.strip()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    await audit(user, "owner_profile_updated", "owner", owner_id, f"name={payload.name}")
    return {"message": "ok"}


class AccountAction(BaseModel):
    action: str  # suspend | activate | ban | delete
    reason: str = ""


@router.post("/owners/{owner_id}/account")
async def account_action(owner_id: str, payload: AccountAction,
                         user: dict = Depends(require_role("admin"))):
    owner = await db.users.find_one({"_id": ObjectId(owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    if payload.action == "suspend":
        update = {"is_active": False}
    elif payload.action == "activate":
        update = {"is_active": True, "is_banned": False, "is_deleted": False}
    elif payload.action == "ban":
        update = {"is_active": False, "is_banned": True}
    elif payload.action == "delete":
        update = {"is_active": False, "is_deleted": True,
                  "email": f"deleted_{owner_id}@deleted.campomark.local"}
        await db.fields.update_many({"owner_id": owner_id}, {"$set": {"active": False}})
    else:
        raise HTTPException(status_code=400, detail="Acao invalida")
    await db.users.update_one({"_id": owner["_id"]}, {"$set": update})
    await audit(user, f"owner_{payload.action}", "owner", owner_id, payload.reason)
    if payload.action in ("suspend", "ban"):
        await notify(owner_id, "Aviso da plataforma",
                     f"Sua conta foi {'suspensa' if payload.action == 'suspend' else 'banida'}. {payload.reason}")
    return {"message": "ok", "action": payload.action}


class WarnPayload(BaseModel):
    message: str


@router.post("/owners/{owner_id}/warn")
async def warn_owner(owner_id: str, payload: WarnPayload, background_tasks: BackgroundTasks,
                     user: dict = Depends(require_role("admin"))):
    owner = await db.users.find_one({"_id": ObjectId(owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    if len(payload.message.strip()) < 3:
        raise HTTPException(status_code=400, detail="Mensagem muito curta")
    await notify(owner_id, "Aviso da plataforma CampoMark", payload.message)
    background_tasks.add_task(send_owner_warning, owner, payload.message)
    await audit(user, "owner_warned", "owner", owner_id, payload.message[:200])
    return {"message": "ok"}


@router.put("/fields/{field_id}")
async def admin_update_field(field_id: str, payload: FieldPayload,
                             user: dict = Depends(require_role("admin"))):
    data = payload.model_dump()
    data["currency"] = currency_for_country(payload.country)
    res = await db.fields.update_one({"id": field_id}, {"$set": data})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    await audit(user, "field_updated", "field", field_id, f"name={payload.name}")
    f = await db.fields.find_one({"id": field_id})
    return serialize_field(f)


class VisibilityPayload(BaseModel):
    hidden: bool


@router.post("/fields/{field_id}/visibility")
async def field_visibility(field_id: str, payload: VisibilityPayload,
                           user: dict = Depends(require_role("admin"))):
    res = await db.fields.update_one({"id": field_id}, {"$set": {"hidden": payload.hidden}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    await audit(user, "field_hidden" if payload.hidden else "field_visible", "field", field_id)
    return {"message": "ok", "hidden": payload.hidden}


@router.delete("/fields/{field_id}")
async def admin_delete_field(field_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.fields.update_one({"id": field_id}, {"$set": {"active": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    await audit(user, "field_deleted", "field", field_id)
    return {"message": "ok"}


@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_role("admin"))):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return logs

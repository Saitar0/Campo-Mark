from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from deps import db, require_role, subscription_valid, trial_days_left

router = APIRouter(prefix="/api/admin", tags=["admin"])

SUBSCRIPTION_PRICE_BRL = 149.0


@router.get("/metrics")
async def metrics(user: dict = Depends(require_role("admin"))):
    from deps import now_utc
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


@router.get("/owners")
async def list_owners(user: dict = Depends(require_role("admin"))):
    owners = await db.users.find({"role": "owner"}).sort("created_at", -1).to_list(1000)
    out = []
    for o in owners:
        oid = str(o["_id"])
        fields_count = await db.fields.count_documents({"owner_id": oid, "active": True})
        bookings_count = await db.bookings.count_documents({"owner_id": oid, "status": "confirmed"})
        sub = o.get("subscription") or {}
        out.append({
            "id": oid, "name": o.get("name"), "email": o.get("email"),
            "phone": o.get("phone", ""), "is_active": o.get("is_active", True),
            "created_at": o.get("created_at"),
            "subscription_status": sub.get("status", "none"),
            "subscription_valid": subscription_valid(o),
            "trial_days_left": trial_days_left(o),
            "current_period_end": sub.get("current_period_end"),
            "fields_count": fields_count, "bookings_count": bookings_count,
        })
    return out


@router.post("/owners/{owner_id}/toggle")
async def toggle_owner(owner_id: str, user: dict = Depends(require_role("admin"))):
    owner = await db.users.find_one({"_id": ObjectId(owner_id), "role": "owner"})
    if not owner:
        raise HTTPException(status_code=404, detail="Dono nao encontrado")
    new_state = not owner.get("is_active", True)
    await db.users.update_one({"_id": owner["_id"]}, {"$set": {"is_active": new_state}})
    return {"is_active": new_state}

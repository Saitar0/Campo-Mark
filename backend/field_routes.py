import uuid
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import (db, now_utc, require_role, owner_can_operate, get_slot_statuses,
                  public_user)

router = APIRouter(prefix="/api", tags=["fields"])

FIELD_TYPES = ("society", "futsal", "campo")


class ScheduleWindow(BaseModel):
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    price: float = Field(gt=0)


class FieldPayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    field_type: str
    description: str = ""
    address: str = ""
    city: str = Field(min_length=2)
    neighborhood: str = ""
    photos: list[str] = []
    amenities: list[str] = []
    slot_duration_minutes: int = Field(default=60, ge=30, le=180)
    weekly_schedule: dict[str, list[ScheduleWindow]] = {}
    cancel_hours: int = Field(default=24, ge=0)
    refund_percent: int = Field(default=100, ge=0, le=100)
    accept_online: bool = True
    accept_on_site: bool = True


class BlockPayload(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    reason: str = ""


def serialize_field(f: dict) -> dict:
    f.pop("_id", None)
    prices = [w["price"] for windows in (f.get("weekly_schedule") or {}).values() for w in windows]
    f["price_from"] = min(prices) if prices else None
    return f


async def _owners_map(fields):
    ids = {f["owner_id"] for f in fields}
    owners = await db.users.find({"_id": {"$in": [ObjectId(o) for o in ids if ObjectId.is_valid(o)]}}).to_list(500)
    return {str(o["_id"]): o for o in owners}


@router.get("/fields")
async def list_fields(city: Optional[str] = None, field_type: Optional[str] = None,
                      q: Optional[str] = None):
    fields = await db.fields.find({"active": True}).to_list(500)
    owners = await _owners_map(fields)
    out = []
    for f in fields:
        owner = owners.get(f["owner_id"])
        if not owner or not owner_can_operate(owner):
            continue
        if city and f.get("city", "").lower() != city.lower():
            continue
        if field_type and f.get("field_type") != field_type:
            continue
        if q:
            hay = f"{f.get('name','')} {f.get('neighborhood','')} {f.get('city','')}".lower()
            if q.lower() not in hay:
                continue
        out.append(serialize_field(f))
    return out


@router.get("/fields/{field_id}")
async def get_field(field_id: str):
    f = await db.fields.find_one({"id": field_id, "active": True})
    if not f:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    return serialize_field(f)


@router.get("/fields/{field_id}/availability")
async def get_availability(field_id: str, date: str):
    f = await db.fields.find_one({"id": field_id, "active": True})
    if not f:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    slots = await get_slot_statuses(f, date)
    for s in slots:
        s.pop("booking", None)
    return {"date": date, "slots": slots}


@router.get("/owner/fields")
async def my_fields(user: dict = Depends(require_role("owner"))):
    fields = await db.fields.find({"owner_id": str(user["_id"]), "active": True}).to_list(100)
    return [serialize_field(f) for f in fields]


@router.post("/owner/fields")
async def create_field(payload: FieldPayload, user: dict = Depends(require_role("owner"))):
    if payload.field_type not in FIELD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de campo invalido")
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "owner_id": str(user["_id"]),
                "owner_name": user.get("name", ""), "active": True,
                "created_at": now_utc().isoformat()})
    await db.fields.insert_one(doc)
    return serialize_field(doc)


@router.put("/owner/fields/{field_id}")
async def update_field(field_id: str, payload: FieldPayload,
                       user: dict = Depends(require_role("owner"))):
    if payload.field_type not in FIELD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de campo invalido")
    res = await db.fields.update_one({"id": field_id, "owner_id": str(user["_id"])},
                                     {"$set": payload.model_dump()})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    f = await db.fields.find_one({"id": field_id})
    return serialize_field(f)


@router.delete("/owner/fields/{field_id}")
async def delete_field(field_id: str, user: dict = Depends(require_role("owner"))):
    res = await db.fields.update_one({"id": field_id, "owner_id": str(user["_id"])},
                                     {"$set": {"active": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    return {"message": "ok"}


@router.get("/owner/fields/{field_id}/agenda")
async def owner_agenda(field_id: str, date: str, user: dict = Depends(require_role("owner"))):
    f = await db.fields.find_one({"id": field_id, "owner_id": str(user["_id"])})
    if not f:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    slots = await get_slot_statuses(f, date)
    out = []
    for s in slots:
        b = s.pop("booking", None)
        slot = {**s}
        if b:
            slot["booking"] = {"id": b["id"], "customer_name": b.get("customer_name"),
                               "customer_phone": b.get("customer_phone"), "status": b["status"],
                               "payment_status": b.get("payment_status"),
                               "payment_method": b.get("payment_method")}
        out.append(slot)
    blocks = await db.blocks.find({"field_id": field_id, "date": date}, {"_id": 0}).to_list(100)
    return {"date": date, "slots": out, "blocks": blocks}


@router.post("/owner/fields/{field_id}/blocks")
async def create_block(field_id: str, payload: BlockPayload,
                       user: dict = Depends(require_role("owner"))):
    f = await db.fields.find_one({"id": field_id, "owner_id": str(user["_id"])})
    if not f:
        raise HTTPException(status_code=404, detail="Campo nao encontrado")
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="Horario final deve ser maior que o inicial")
    conflict = await db.bookings.find_one({
        "field_id": field_id, "date": payload.date, "status": "confirmed",
        "start_time": {"$lt": payload.end_time}, "end_time": {"$gt": payload.start_time}})
    if conflict:
        raise HTTPException(status_code=409, detail="Existe reserva confirmada nesse intervalo")
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "field_id": field_id, "created_at": now_utc().isoformat()})
    await db.blocks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/owner/blocks/{block_id}")
async def delete_block(block_id: str, user: dict = Depends(require_role("owner"))):
    block = await db.blocks.find_one({"id": block_id})
    if not block:
        raise HTTPException(status_code=404, detail="Bloqueio nao encontrado")
    f = await db.fields.find_one({"id": block["field_id"], "owner_id": str(user["_id"])})
    if not f:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.blocks.delete_one({"id": block_id})
    return {"message": "ok"}

import os
from datetime import datetime, timezone

import stripe
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import db, now_utc, require_role, get_current_user
from booking_routes import _notify_new_booking

router = APIRouter(prefix="/api", tags=["payments"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
SUBSCRIPTION_LOOKUP_KEY = "campomark_pro_monthly"

SMP_COUNTRIES = {
    "AU", "AT", "BE", "BG", "CA", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GI",
    "GR", "HK", "HU", "IE", "IT", "JP", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL",
    "PT", "RO", "SG", "SK", "SI", "ES", "SE", "CH", "GB", "US",
}

_tax_mode = None


def get_tax_mode() -> str:
    global _tax_mode
    if _tax_mode is None:
        try:
            country = stripe.Account.retrieve()["country"]
            # BR sandbox doesn't support Stripe Tax, so fall back to plain checkout ("diy").
            _tax_mode = "full" if country in SMP_COUNTRIES else "diy"
        except stripe.error.StripeError:
            _tax_mode = "diy"
    return _tax_mode


def create_session(**kwargs):
    tax_mode = get_tax_mode()
    if tax_mode == "full":
        try:
            return stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
        except stripe.error.InvalidRequestError as e:
            msg = (e.user_message or "").lower()
            if "managed payments" in msg or "ineligible" in msg:
                return stripe.checkout.Session.create(
                    **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
            raise
    if tax_mode == "calc_only":
        return stripe.checkout.Session.create(
            **kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
    return stripe.checkout.Session.create(**kwargs)


class BookingCheckoutRequest(BaseModel):
    booking_id: str
    origin_url: str


class SubscribeRequest(BaseModel):
    origin_url: str


async def handle_paid_session(session: dict):
    meta = session.get("metadata") or {}
    if meta.get("type") == "booking":
        booking = await db.bookings.find_one({"id": meta.get("booking_id")})
        if booking and booking["status"] == "pending_payment":
            await db.bookings.update_one(
                {"id": booking["id"], "status": "pending_payment"},
                {"$set": {"status": "confirmed", "payment_status": "paid",
                          "stripe_payment_intent_id": session.get("payment_intent"),
                          "paid_at": now_utc().isoformat()}})
            booking = await db.bookings.find_one({"id": booking["id"]})
            await _notify_new_booking(booking)
    elif meta.get("type") == "subscription":
        sub_id = session.get("subscription")
        update = {"subscription.status": "active",
                  "subscription.stripe_customer_id": session.get("customer"),
                  "subscription.stripe_subscription_id": sub_id}
        if sub_id:
            try:
                sub = stripe.Subscription.retrieve(sub_id)
                update["subscription.current_period_end"] = datetime.fromtimestamp(
                    sub.current_period_end, tz=timezone.utc).isoformat()
            except stripe.error.StripeError:
                pass
        await db.users.update_one({"_id": ObjectId(meta["user_id"])}, {"$set": update})


@router.post("/payments/booking-checkout")
async def booking_checkout(req: BookingCheckoutRequest, user: dict = Depends(require_role("customer"))):
    booking = await db.bookings.find_one({"id": req.booking_id, "customer_id": str(user["_id"])})
    if not booking:
        raise HTTPException(status_code=404, detail="Reserva nao encontrada")
    if booking["status"] != "pending_payment":
        raise HTTPException(status_code=400, detail="Reserva nao esta pendente de pagamento")
    amount_cents = int(round(booking["price"] * 100))
    session = create_session(
        line_items=[{"price_data": {
            "currency": "brl", "unit_amount": amount_cents,
            "product_data": {"name": f"Reserva - {booking['field_name']} ({booking['date']} {booking['start_time']})"}},
            "quantity": 1}],
        mode="payment",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"type": "booking", "booking_id": booking["id"]},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": str(user["_id"]), "type": "booking",
        "booking_id": booking["id"], "amount": amount_cents, "currency": "brl",
        "status": "initiated", "payment_status": "pending",
        "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()})
    await db.bookings.update_one({"id": booking["id"]}, {"$set": {"session_id": session.id}})
    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/payments/subscribe")
async def subscribe(req: SubscribeRequest, user: dict = Depends(require_role("owner"))):
    prices = stripe.Price.list(lookup_keys=[SUBSCRIPTION_LOOKUP_KEY], active=True, limit=1).data
    if not prices:
        raise HTTPException(status_code=500, detail="Plano nao configurado")
    price = prices[0]
    session = create_session(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="subscription",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"type": "subscription", "user_id": str(user["_id"])},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": str(user["_id"]), "type": "subscription",
        "lookup_key": SUBSCRIPTION_LOOKUP_KEY, "amount": price.unit_amount or 0,
        "currency": price.currency, "status": "initiated", "payment_status": "pending",
        "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()})
    return {"checkout_url": session.url, "session_id": session.id}


@router.get("/payments/plan")
async def plan_info():
    prices = stripe.Price.list(lookup_keys=[SUBSCRIPTION_LOOKUP_KEY], active=True, limit=1).data
    if not prices:
        return {"price": None}
    p = prices[0]
    return {"price": (p.unit_amount or 0) / 100, "currency": p.currency,
            "interval": (p.recurring or {}).get("interval")}


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transacao nao encontrada")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "stripe_subscription_id": s.subscription,
                              "stripe_payment_intent_id": s.payment_intent,
                              "updated_at": now_utc().isoformat()}})
                await handle_paid_session({"metadata": s.metadata, "payment_intent": s.payment_intent,
                                           "subscription": s.subscription, "customer": s.customer})
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"],
            "payment_status": record["payment_status"], "type": record.get("type"),
            "booking_id": record.get("booking_id")}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "stripe_subscription_id": obj.get("subscription"),
                      "stripe_payment_intent_id": obj.get("payment_intent"),
                      "updated_at": now_utc().isoformat()}})
        await handle_paid_session(obj)
    elif t == "checkout.session.async_payment_succeeded":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"payment_status": "paid", "updated_at": now_utc().isoformat()}})
        await handle_paid_session(obj)
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": now_utc().isoformat()}})
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one({"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": now_utc().isoformat()}})
    elif t == "charge.refunded":
        await db.payment_transactions.update_one({"stripe_payment_intent_id": obj.get("payment_intent")},
            {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": now_utc().isoformat()}})
    elif t in ("customer.subscription.updated", "customer.subscription.deleted"):
        status_map = {"active": "active", "trialing": "trialing", "past_due": "past_due",
                      "canceled": "canceled", "unpaid": "past_due", "incomplete_expired": "canceled"}
        new_status = status_map.get(obj.get("status"), obj.get("status"))
        update = {"subscription.status": new_status}
        if obj.get("current_period_end"):
            update["subscription.current_period_end"] = datetime.fromtimestamp(
                obj["current_period_end"], tz=timezone.utc).isoformat()
        await db.users.update_one({"subscription.stripe_subscription_id": obj["id"]}, {"$set": update})
    return {"status": "ok"}

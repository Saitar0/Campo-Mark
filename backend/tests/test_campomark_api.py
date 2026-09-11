"""CampoMark backend API tests - covers auth, fields, bookings, payments, admin."""
import os
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-booking-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "joaovitor.gallina09@gmail.com", "password": "CampoMark@2026"}
OWNER = {"email": "dono@campomark.com", "password": "demo12345"}
CUSTOMER = {"email": "jogador@campomark.com", "password": "demo12345"}


def _session(creds=None):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    if creds:
        r = s.post(f"{API}/auth/login", json=creds, timeout=30)
        assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def customer_session():
    return _session(CUSTOMER)


@pytest.fixture(scope="module")
def owner_session():
    return _session(OWNER)


@pytest.fixture(scope="module")
def admin_session():
    return _session(ADMIN)


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_login_owner(self):
        r = requests.post(f"{API}/auth/login", json=OWNER, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "owner"
        assert data.get("subscription", {}).get("status") in ("trialing", "active")

    def test_login_customer(self):
        r = requests.post(f"{API}/auth/login", json=CUSTOMER, timeout=30)
        assert r.status_code == 200
        assert r.json()["role"] == "customer"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": CUSTOMER["email"], "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_ok(self, customer_session):
        r = customer_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == CUSTOMER["email"]

    def test_google_session_invalid(self):
        r = requests.post(f"{API}/auth/google/session",
                          json={"session_id": "invalid_xxx", "role": "customer"}, timeout=30)
        assert r.status_code == 401

    def test_forgot_password_generic_registered(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": CUSTOMER["email"]}, timeout=30)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_forgot_password_generic_unregistered(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "nobody-xyz-999@example.com"}, timeout=30)
        assert r.status_code == 200

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "invalid-token-xyz", "password": "newpass123"}, timeout=30)
        assert r.status_code == 400


# ---------- Fields (public) ----------
class TestFieldsPublic:
    def test_list_fields(self):
        r = requests.get(f"{API}/fields", timeout=30)
        assert r.status_code == 200
        fields = r.json()
        assert isinstance(fields, list)
        names = {f["name"] for f in fields}
        assert "Arena Bola de Ouro" in names
        assert "Futsal Show de Bola" in names
        assert "Campo do Vila Rica" in names

    def test_filter_by_city(self):
        r = requests.get(f"{API}/fields", params={"city": "Curitiba"}, timeout=30)
        assert r.status_code == 200
        for f in r.json():
            assert f["city"].lower() == "curitiba"

    def test_filter_by_type(self):
        r = requests.get(f"{API}/fields", params={"field_type": "futsal"}, timeout=30)
        assert r.status_code == 200
        for f in r.json():
            assert f["field_type"] == "futsal"

    def test_get_field_availability(self):
        fields = requests.get(f"{API}/fields", timeout=30).json()
        arena = next(f for f in fields if f["name"] == "Arena Bola de Ouro")
        date = (datetime.utcnow() + timedelta(days=2)).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/fields/{arena['id']}/availability", params={"date": date}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["date"] == date
        assert isinstance(data["slots"], list)
        assert len(data["slots"]) > 0
        assert all("start" in s and "status" in s for s in data["slots"])


# ---------- Bookings ----------
class TestBookings:
    @pytest.fixture(scope="class")
    def arena(self):
        fields = requests.get(f"{API}/fields", timeout=30).json()
        return next(f for f in fields if f["name"] == "Arena Bola de Ouro")

    @pytest.fixture(scope="class")
    def future_date(self):
        # Pick a weekday date +5 days
        return (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d")

    def test_create_on_site_booking(self, customer_session, arena, future_date, request):
        r = requests.get(f"{API}/fields/{arena['id']}/availability",
                         params={"date": future_date}, timeout=30)
        slots = [s for s in r.json()["slots"] if s["status"] == "available"]
        assert slots, "No available slots for test"
        slot = slots[0]
        payload = {"field_id": arena["id"], "date": future_date,
                   "start_time": slot["start"], "payment_method": "on_site"}
        r = customer_session.post(f"{API}/bookings", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "confirmed"
        assert b["payment_method"] == "on_site"
        request.config.cache.set("booking_id", b["id"])
        request.config.cache.set("booking_slot", slot["start"])
        request.config.cache.set("booking_date", future_date)
        request.config.cache.set("field_id", arena["id"])

    def test_duplicate_booking_returns_409(self, customer_session, request):
        arena_id = request.config.cache.get("field_id", None)
        date = request.config.cache.get("booking_date", None)
        start = request.config.cache.get("booking_slot", None)
        assert arena_id and date and start
        r = customer_session.post(f"{API}/bookings",
                                  json={"field_id": arena_id, "date": date,
                                        "start_time": start, "payment_method": "on_site"}, timeout=30)
        assert r.status_code == 409

    def test_my_bookings_lists_new(self, customer_session, request):
        booking_id = request.config.cache.get("booking_id", None)
        assert booking_id
        r = customer_session.get(f"{API}/bookings/mine", timeout=30)
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert booking_id in ids

    def test_slot_now_reserved_in_availability(self, request):
        arena_id = request.config.cache.get("field_id", None)
        date = request.config.cache.get("booking_date", None)
        start = request.config.cache.get("booking_slot", None)
        r = requests.get(f"{API}/fields/{arena_id}/availability",
                         params={"date": date}, timeout=30)
        slot = next(s for s in r.json()["slots"] if s["start"] == start)
        assert slot["status"] != "available"

    def test_online_checkout_generates_url(self, customer_session, arena, request):
        # Create pending_payment booking
        future = (datetime.utcnow() + timedelta(days=6)).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/fields/{arena['id']}/availability",
                         params={"date": future}, timeout=30)
        slots = [s for s in r.json()["slots"] if s["status"] == "available"]
        slot = slots[0]
        r = customer_session.post(f"{API}/bookings",
                                  json={"field_id": arena["id"], "date": future,
                                        "start_time": slot["start"], "payment_method": "online"}, timeout=30)
        assert r.status_code == 200
        b = r.json()
        assert b["status"] == "pending_payment"
        online_id = b["id"]
        r = customer_session.post(f"{API}/payments/booking-checkout",
                                  json={"booking_id": online_id, "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "checkout_url" in data
        assert "stripe.com" in data["checkout_url"]
        request.config.cache.set("online_booking_id", online_id)

    def test_cancel_online_pending(self, customer_session, request):
        bid = request.config.cache.get("online_booking_id", None)
        assert bid
        r = customer_session.post(f"{API}/bookings/{bid}/cancel", timeout=30)
        assert r.status_code == 200

    def test_cancel_confirmed_booking(self, customer_session, request):
        bid = request.config.cache.get("booking_id", None)
        r = customer_session.post(f"{API}/bookings/{bid}/cancel", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "refunded" in data


# ---------- Owner ----------
class TestOwner:
    def test_owner_fields(self, owner_session):
        r = owner_session.get(f"{API}/owner/fields", timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_owner_agenda(self, owner_session):
        fields = owner_session.get(f"{API}/owner/fields", timeout=30).json()
        f = fields[0]
        date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d")
        r = owner_session.get(f"{API}/owner/fields/{f['id']}/agenda",
                              params={"date": date}, timeout=30)
        assert r.status_code == 200
        assert "slots" in r.json()

    def test_owner_create_block(self, owner_session, request):
        fields = owner_session.get(f"{API}/owner/fields", timeout=30).json()
        f = fields[0]
        date = (datetime.utcnow() + timedelta(days=10)).strftime("%Y-%m-%d")
        r = owner_session.post(f"{API}/owner/fields/{f['id']}/blocks",
                               json={"date": date, "start_time": "10:00",
                                     "end_time": "11:00", "reason": "TEST_block"}, timeout=30)
        assert r.status_code == 200, r.text
        block_id = r.json()["id"]
        # Verify appears in agenda
        r = owner_session.get(f"{API}/owner/fields/{f['id']}/agenda",
                              params={"date": date}, timeout=30)
        assert any(b["id"] == block_id for b in r.json()["blocks"])
        # Cleanup
        owner_session.delete(f"{API}/owner/blocks/{block_id}", timeout=30)

    def test_owner_create_field(self, owner_session):
        payload = {
            "name": "TEST_ Field CampoMark", "field_type": "society",
            "description": "Test", "address": "Rua Test 1", "city": "TestCity",
            "neighborhood": "Centro", "photos": [], "amenities": [],
            "slot_duration_minutes": 60,
            "weekly_schedule": {"0": [{"start": "08:00", "end": "22:00", "price": 100.0}]},
            "cancel_hours": 24, "refund_percent": 100,
            "accept_online": True, "accept_on_site": True,
        }
        r = owner_session.post(f"{API}/owner/fields", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        # Verify in public list
        pub = requests.get(f"{API}/fields", params={"city": "TestCity"}, timeout=30).json()
        assert any(f["id"] == fid for f in pub)
        # Cleanup
        owner_session.delete(f"{API}/owner/fields/{fid}", timeout=30)

    def test_owner_revenue(self, owner_session):
        month = datetime.utcnow().strftime("%Y-%m")
        r = owner_session.get(f"{API}/owner/revenue", params={"month": month}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "count" in data

    def test_owner_subscribe_checkout(self, owner_session):
        r = owner_session.post(f"{API}/payments/subscribe",
                               json={"origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "stripe.com" in data["checkout_url"]

    def test_plan_info(self):
        r = requests.get(f"{API}/payments/plan", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("price") == 149.0
        assert data.get("interval") == "month"


# ---------- Admin ----------
class TestAdmin:
    def test_admin_metrics(self, admin_session):
        r = admin_session.get(f"{API}/admin/metrics", timeout=30)
        assert r.status_code == 200
        data = r.json()
        for k in ("owners_total", "subscriptions_active", "mrr", "fields_total", "gmv_month"):
            assert k in data

    def test_admin_list_owners(self, admin_session):
        r = admin_session.get(f"{API}/admin/owners", timeout=30)
        assert r.status_code == 200
        owners = r.json()
        assert any(o["email"] == OWNER["email"] for o in owners)

    def test_admin_toggle_owner_affects_public(self, admin_session):
        owners = admin_session.get(f"{API}/admin/owners", timeout=30).json()
        owner = next(o for o in owners if o["email"] == OWNER["email"])
        # Disable
        r = admin_session.post(f"{API}/admin/owners/{owner['id']}/toggle", timeout=30)
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        pub = requests.get(f"{API}/fields", timeout=30).json()
        assert not any(f["owner_id"] == owner["id"] for f in pub), "Disabled owner's fields still public"
        # Re-enable
        r2 = admin_session.post(f"{API}/admin/owners/{owner['id']}/toggle", timeout=30)
        assert r2.json()["is_active"] is True

    def test_customer_forbidden_admin(self, customer_session):
        r = customer_session.get(f"{API}/admin/metrics", timeout=30)
        assert r.status_code == 403

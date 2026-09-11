import os
import re
import ipaddress
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "CampoMark"
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> bool:
    if not EMAIL_KEY or EMAIL_KEY.startswith("{"):
        logger.warning("Email key not configured; skipping send to %s", to)
        return False
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error("Email send failed to %s: %s", to, e)
        return False


def _wrap(content: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (f'<table role="presentation" width="100%"><tr><td style="padding:24px;'
            f'font-family:Arial,sans-serif;color:#0f172a">{content}'
            f'<p style="font-size:12px;color:#888;margin-top:24px">Enviado por {brand}. '
            f'Nunca pedimos sua senha ou dados de cartao por e-mail.</p></td></tr></table>')


def _booking_rows(booking: dict) -> str:
    return (f'<p><strong>Campo:</strong> {escape(booking["field_name"])}<br>'
            f'<strong>Data:</strong> {escape(booking["date"])}<br>'
            f'<strong>Horario:</strong> {escape(booking["start_time"])} - {escape(booking["end_time"])}<br>'
            f'<strong>Valor:</strong> R$ {booking["price"]:.2f}<br>'
            f'<strong>Endereco:</strong> {escape(booking.get("field_address", ""))}</p>')


async def send_booking_confirmation_customer(user: dict, booking: dict) -> bool:
    link = f"{FRONTEND_URL}/minhas-reservas"
    html = _wrap(
        f'<p>Ola, {escape(user.get("name", ""))}! Sua reserva esta confirmada.</p>'
        f'{_booking_rows(booking)}'
        f'<p><a href="{escape(link)}">Ver minhas reservas</a></p>')
    return await send_email(to=user["email"], subject=f"Reserva confirmada - {EMAIL_FROM_NAME}", html=html)


async def send_booking_notification_owner(owner: dict, booking: dict) -> bool:
    html = _wrap(
        f'<p>Ola, {escape(owner.get("name", ""))}! Voce recebeu uma nova reserva.</p>'
        f'{_booking_rows(booking)}'
        f'<p><strong>Cliente:</strong> {escape(booking.get("customer_name", ""))} '
        f'({escape(booking.get("customer_phone", ""))})</p>')
    return await send_email(to=owner["email"], subject=f"Nova reserva - {booking['field_name']}", html=html)


async def send_booking_cancelled(user: dict, booking: dict, by_owner: bool) -> bool:
    who = "pelo dono do campo" if by_owner else "pelo cliente"
    html = _wrap(
        f'<p>Ola, {escape(user.get("name", ""))}! Uma reserva foi cancelada {who}.</p>'
        f'{_booking_rows(booking)}')
    return await send_email(to=user["email"], subject=f"Reserva cancelada - {booking['field_name']}", html=html)


async def send_password_reset_email(to_email: str, token: str) -> bool:
    link = f"{FRONTEND_URL}/redefinir-senha?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not FRONTEND_URL.startswith("https://"):
        if urlparse(FRONTEND_URL).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = _wrap(
        f'<p>Recebemos uma solicitacao para redefinir sua senha no {brand}.</p>'
        f'<p><a href="{escape(link)}">Redefinir minha senha</a></p>'
        f'<p>Este link expira em 1 hora e so pode ser usado uma vez. Se voce nao solicitou, '
        f'ignore este e-mail.</p>')
    return await send_email(to=to_email, subject=f"Redefinir sua senha - {brand}", html=html)

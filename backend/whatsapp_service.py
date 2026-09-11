import os
import asyncio
import logging

logger = logging.getLogger(__name__)

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")


def whatsapp_configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM)


async def send_whatsapp(to_phone: str, message: str) -> bool:
    if not to_phone:
        return False
    if not whatsapp_configured():
        logger.info("WhatsApp nao configurado; mensagem para %s ignorada: %s", to_phone, message[:60])
        return False

    def _send():
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        to = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone}"
        client.messages.create(from_=f"whatsapp:{TWILIO_WHATSAPP_FROM}", to=to, body=message)

    try:
        await asyncio.to_thread(_send)
        return True
    except Exception as e:
        logger.error("WhatsApp send failed to %s: %s", to_phone, e)
        return False


def booking_message(booking: dict, prefix: str) -> str:
    return (f"{prefix}\nCampo: {booking['field_name']}\nData: {booking['date']}\n"
            f"Horario: {booking['start_time']} - {booking['end_time']}\n"
            f"Valor: R$ {booking['price']:.2f}")

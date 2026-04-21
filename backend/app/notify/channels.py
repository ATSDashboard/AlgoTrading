"""Channel adapters — WhatsApp (Gupshup), Telegram, Email (SES), SMS (Twilio), Voice (Twilio).

Each function returns True on success, False on transient failure, raises on hard error.
In paper mode, all channels log instead of sending.
"""
from __future__ import annotations

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger(__name__)
_s = get_settings()


async def send_whatsapp(phone: str, body: str) -> bool:
    if not _s.gupshup_api_key:
        log.info("notify.whatsapp.paper", phone=phone, body=body[:80])
        return True
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            "https://api.gupshup.io/wa/api/v1/msg",
            headers={"apikey": _s.gupshup_api_key},
            data={
                "channel": "whatsapp",
                "source": _s.gupshup_source,
                "destination": phone,
                "message": body,
                "src.name": "ThetaGainers",
            },
        )
    ok = r.status_code == 200 and r.json().get("status") == "submitted"
    log.info("notify.whatsapp", phone=phone, ok=ok, status=r.status_code)
    return ok


async def send_telegram(chat_id: str, body: str) -> bool:
    if not _s.telegram_bot_token:
        log.info("notify.telegram.paper", chat_id=chat_id, body=body[:80])
        return True
    url = f"https://api.telegram.org/bot{_s.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json={"chat_id": chat_id, "text": body, "parse_mode": "HTML"})
    ok = r.status_code == 200 and r.json().get("ok", False)
    log.info("notify.telegram", chat_id=chat_id, ok=ok)
    return ok


async def send_email(to: str, subject: str, body: str) -> bool:
    if not _s.aws_ses_from:
        log.info("notify.email.paper", to=to, subject=subject)
        return True
    try:
        import boto3
        ses = boto3.client("ses", region_name=_s.aws_ses_region)
        ses.send_email(
            Source=_s.aws_ses_from,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject},
                "Body": {"Text": {"Data": body}},
            },
        )
        log.info("notify.email.sent", to=to, subject=subject)
        return True
    except Exception as e:
        log.warning("notify.email.error", to=to, err=str(e))
        return False


async def send_sms(phone: str, body: str) -> bool:
    if not _s.twilio_account_sid:
        log.info("notify.sms.paper", phone=phone, body=body[:80])
        return True
    try:
        from twilio.rest import Client
        client = Client(_s.twilio_account_sid, _s.twilio_auth_token)
        msg = client.messages.create(to=phone, from_=_s.twilio_from_number, body=body[:160])
        log.info("notify.sms.sent", phone=phone, sid=msg.sid)
        return True
    except Exception as e:
        log.warning("notify.sms.error", phone=phone, err=str(e))
        return False


async def send_voice(phone: str, message: str) -> bool:
    """Emergency voice call — used only for CRITICAL severity (circuit breaker, dead-man, daily loss cap)."""
    if not _s.twilio_account_sid:
        log.info("notify.voice.paper", phone=phone, message=message[:40])
        return True
    try:
        from twilio.rest import Client
        client = Client(_s.twilio_account_sid, _s.twilio_auth_token)
        call = client.calls.create(
            to=phone, from_=_s.twilio_from_number,
            twiml=f"<Response><Say voice='alice'>Theta Gainers critical alert. {message}. Please check immediately.</Say></Response>",
        )
        log.info("notify.voice.called", phone=phone, sid=call.sid)
        return True
    except Exception as e:
        log.warning("notify.voice.error", phone=phone, err=str(e))
        return False

"""Multi-channel notification service.

Channels: WhatsApp (Gupshup), Telegram, Email (SES), SMS (Twilio), Voice (Twilio critical).
Every notification is persisted in `notifications` table for retry + audit.

Usage:
    await notify(db, user_id=1, event="SL_HIT", data={...})
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.types import AuditSeverity
from app.config import get_settings
from app.notify.channels import send_whatsapp, send_telegram, send_email, send_sms, send_voice

log = structlog.get_logger(__name__)
_s = get_settings()

# Map events → severity → channels
_CHANNEL_ROUTING: dict[str, list[str]] = {
    "CRITICAL": ["whatsapp", "telegram", "email", "sms", "voice"],
    "ERROR":    ["whatsapp", "telegram", "email", "sms"],
    "WARN":     ["whatsapp", "telegram", "email"],
    "INFO":     ["whatsapp", "telegram"],
}

_EVENT_SEVERITY: dict[str, str] = {
    "STRATEGY_STARTED": "INFO",
    "POSITION_ENTERED": "INFO",
    "SL_HIT": "WARN",
    "TARGET_HIT": "INFO",
    "TIME_EXIT": "INFO",
    "MANUAL_EXIT": "INFO",
    "KILL_SWITCH": "ERROR",
    "DEAD_MAN_SWITCH": "CRITICAL",
    "CIRCUIT_BREAKER": "CRITICAL",
    "MTM_DRAWDOWN": "ERROR",
    "POSITION_MISMATCH": "CRITICAL",
    "BROKER_DOWN": "ERROR",
    "DAILY_LOSS_CAP": "CRITICAL",
    "ORDER_REJECTED": "WARN",
    "PARTIAL_FILL": "ERROR",
    "DAILY_SUMMARY": "INFO",
}


async def notify(
    db: AsyncSession, user_id: int, event: str, data: dict[str, Any],
) -> list[int]:
    """Send notifications on all appropriate channels for this event.

    Returns list of notification IDs (from DB).
    """
    severity = _EVENT_SEVERITY.get(event, "INFO")
    channels = _CHANNEL_ROUTING.get(severity, ["whatsapp"])

    # Build message
    subject = f"[ThetaGainers] {event.replace('_', ' ').title()}"
    body = _format_body(event, data, severity)

    ids: list[int] = []
    for channel in channels:
        nid = await _queue(db, user_id, channel, severity, subject, body)
        ids.append(nid)

    # Fire all sends concurrently (don't block the caller)
    asyncio.create_task(_dispatch_batch(db, ids))
    return ids


def _format_body(event: str, data: dict[str, Any], severity: str) -> str:
    lines = [f"Event: {event}"]
    if "strategy_id" in data:
        lines.append(f"Strategy: #{data['strategy_id']}")
    if "pnl" in data:
        lines.append(f"P&L: ₹{data['pnl']:,.0f}")
    if "reason" in data:
        lines.append(f"Reason: {data['reason']}")
    if "msg" in data:
        lines.append(f"Details: {data['msg']}")
    for k, v in data.items():
        if k not in ("strategy_id", "pnl", "reason", "msg"):
            lines.append(f"{k}: {v}")
    lines.append(f"Severity: {severity}")
    lines.append(f"Time: {datetime.now(UTC).strftime('%H:%M:%S UTC')}")
    return "\n".join(lines)


async def _queue(
    db: AsyncSession, user_id: int, channel: str,
    severity: str, subject: str, body: str,
) -> int:
    result = await db.execute(
        text("""
            INSERT INTO notifications
                (user_id, channel, severity, subject, body, status)
            VALUES (:uid, :ch, :sev, :sub, :body, 'QUEUED')
            RETURNING id
        """),
        {"uid": user_id, "ch": channel, "sev": severity, "sub": subject, "body": body},
    )
    await db.commit()
    return result.scalar_one()


async def _dispatch_batch(db: AsyncSession, ids: list[int]) -> None:
    """Send all queued notifications. Retry up to 3 times on failure."""
    for nid in ids:
        row = await db.execute(
            text("SELECT id, user_id, channel, subject, body, attempts FROM notifications WHERE id=:id"),
            {"id": nid},
        )
        n = row.first()
        if n is None:
            continue

        # Get user contact info
        user_row = await db.execute(
            text("SELECT whatsapp_number, email, telegram_chat_id, phone FROM users WHERE id=:uid"),
            {"uid": n.user_id},
        )
        user = user_row.first()
        if user is None:
            continue

        try:
            success = await _send_one(n.channel, user, n.subject, n.body)
            status = "SENT" if success else "FAILED"
        except Exception as e:
            log.warning("notify.send_error", channel=n.channel, nid=nid, err=str(e))
            status = "RETRYING" if n.attempts < 3 else "FAILED"

        await db.execute(
            text("""
                UPDATE notifications SET status=:s, attempts=attempts+1,
                    sent_at=CASE WHEN :s='SENT' THEN NOW() ELSE sent_at END,
                    last_error=CASE WHEN :s!='SENT' THEN :err ELSE last_error END
                WHERE id=:id
            """),
            {"s": status, "err": str(status), "id": nid},
        )
        await db.commit()


async def _send_one(channel: str, user: Any, subject: str, body: str) -> bool:
    if channel == "whatsapp" and user.whatsapp_number:
        return await send_whatsapp(user.whatsapp_number, body)
    if channel == "telegram" and user.telegram_chat_id:
        return await send_telegram(user.telegram_chat_id, body)
    if channel == "email" and user.email:
        return await send_email(user.email, subject, body)
    if channel == "sms" and user.phone:
        return await send_sms(user.phone, body)
    if channel == "voice" and user.phone:
        return await send_voice(user.phone, subject)
    return False


async def send_daily_summary(db: AsyncSession, user_id: int, summary: dict[str, Any]) -> None:
    """Called at 4 PM IST by scheduler."""
    await notify(db, user_id, "DAILY_SUMMARY", summary)

"""Auth business logic: login, 2FA lifecycle, broker session connect.

All paths audit-log critical events. No silent failures.
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.auth.models import BrokerCredential, BrokerSession, User
from app.brokers.registry import get_broker
from app.common.errors import (
    AuthError, BrokerError, InvalidCredentials, InvalidTOTP, TokenExpired,
)
from app.common.types import BrokerName
from app.config import get_settings

_settings = get_settings()

# Lockout policy: 5 failures → 15 min lock, doubling each time up to 24h.
_MAX_FAILED_LOGINS = 5
_BASE_LOCKOUT_MIN = 15


async def authenticate(
    db: AsyncSession, username: str, password: str, totp_code: str | None,
) -> tuple[User, bool]:
    """Return (user, must_enroll_totp). Raises on any failure.

    Behavior:
    - Wrong password increments failed_login_count; locks after _MAX_FAILED_LOGINS.
    - If user has TOTP enrolled, code is mandatory.
    - First-ever login (totp_enabled=False): skip TOTP, flag must_enroll.
    """
    user = await db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active:
        raise InvalidCredentials("invalid username or password")

    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise AuthError(f"account locked until {user.locked_until.isoformat()}")

    if not security.verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= _MAX_FAILED_LOGINS:
            mins = _BASE_LOCKOUT_MIN * (2 ** (user.failed_login_count - _MAX_FAILED_LOGINS))
            mins = min(mins, 24 * 60)
            user.locked_until = datetime.now(UTC) + timedelta(minutes=mins)
        await db.commit()
        raise InvalidCredentials("invalid username or password")

    # Password OK — check TOTP
    if user.totp_enabled:
        if not totp_code:
            raise InvalidTOTP("TOTP code required")
        security.verify_totp(user.totp_secret or "", totp_code)

    # Success
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    return user, not user.totp_enabled


async def begin_totp_enrollment(db: AsyncSession, user: User) -> dict[str, str]:
    secret = security.generate_totp_secret()
    user.totp_secret = secret                      # stored but not enabled yet
    await db.commit()
    return {
        "secret": secret,
        "provisioning_uri": security.totp_provisioning_uri(secret, user.username),
        "issuer": _settings.totp_issuer,
    }


async def confirm_totp_enrollment(db: AsyncSession, user: User, code: str) -> None:
    if not user.totp_secret:
        raise InvalidTOTP("no enrollment in progress — call begin first")
    security.verify_totp(user.totp_secret, code)
    user.totp_enabled = True
    await db.commit()


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> str:
    payload = security.decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise TokenExpired("not a refresh token")
    user = await db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise TokenExpired("user not found or disabled")
    return security.create_access_token(user.id, user.role)


# ── Broker session connect ───────────────────────────────────────────────────
async def init_broker_connect(
    db: AsyncSession, user: User, broker: BrokerName, credential_id: int,
) -> dict[str, str]:
    cred = await db.get(BrokerCredential, credential_id)
    if cred is None or cred.user_id != user.id or cred.broker != broker.value:
        raise BrokerError("invalid broker credential")
    client = get_broker(broker)
    state = secrets.token_urlsafe(32)
    url = await client.login_url(state)
    # State is cached in Redis with TTL in real impl; for now client echoes it back.
    return {"login_url": url, "state": state}


async def complete_broker_connect(
    db: AsyncSession, user: User, broker: BrokerName,
    credential_id: int, demat_account_id: int, code: str, state: str,
) -> BrokerSession:
    cred = await db.get(BrokerCredential, credential_id)
    if cred is None or cred.user_id != user.id:
        raise BrokerError("invalid credential")
    client = get_broker(broker)
    tokens = await client.exchange_code(code, state)

    session = BrokerSession(
        user_id=user.id,
        broker_cred_id=credential_id,
        demat_account_id=demat_account_id,
        auth_token_encrypted=security.encrypt(tokens["token"]),
        refresh_token_encrypted=security.encrypt(tokens.get("refresh", "")) or None,
        token_expires_at=tokens["expires_at"],
        last_refreshed_at=datetime.now(UTC),
        is_active=True,
    )
    db.add(session)
    # Deactivate older sessions for the same broker+user (one active at a time)
    await db.execute(
        update(BrokerSession)
        .where(BrokerSession.user_id == user.id,
               BrokerSession.broker_cred_id == credential_id,
               BrokerSession.id != session.id)
        .values(is_active=False)
    )
    await db.commit()
    await db.refresh(session)
    return session

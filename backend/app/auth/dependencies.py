"""FastAPI auth dependencies: current_user, require_role, IP allowlist."""
from __future__ import annotations

import ipaddress

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.auth.models import User
from app.common.errors import InsufficientRole, IPNotAllowed, TokenExpired
from app.common.types import UserRole
from app.config import get_settings
from app.db import get_db

_settings = get_settings()


def _parse_allowlist() -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    raw = _settings.ip_allowlist
    if not raw:
        return []
    nets = []
    for s in raw.split(","):
        s = s.strip()
        if s:
            nets.append(ipaddress.ip_network(s, strict=False))
    return nets


_ALLOWLIST = _parse_allowlist()


async def enforce_ip_allowlist(request: Request) -> None:
    if not _ALLOWLIST:
        return
    client_ip = request.client.host if request.client else ""
    try:
        addr = ipaddress.ip_address(client_ip)
    except ValueError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ip not recognized") from e
    if not any(addr in net for net in _ALLOWLIST):
        raise IPNotAllowed(f"ip {client_ip} not in allowlist")


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = security.decode_token(token)
    except TokenExpired as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token type")
    user = await db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


def require_role(*allowed: UserRole):
    allowed_str = {r.value for r in allowed}

    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_str:
            raise InsufficientRole(f"role {user.role} not in {allowed_str}")
        return user
    return _guard


require_admin = require_role(UserRole.ADMIN)
require_trader = require_role(UserRole.ADMIN, UserRole.TRADER)
require_risk = require_role(UserRole.ADMIN, UserRole.RISK_OFFICER)

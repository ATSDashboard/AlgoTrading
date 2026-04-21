"""Seed first admin user. Run once:  python -m app.auth.bootstrap"""
from __future__ import annotations

import asyncio
import os
import sys

from sqlalchemy import select

from app.auth.models import User
from app.auth.security import hash_password
from app.db import session_scope


async def seed_admin(
    username: str = "admin", password: str | None = None, email: str = "admin@navinalgo.in",
) -> None:
    password = password or os.getenv("ADMIN_SEED_PASSWORD", "ChangeMeNow!1")
    async with session_scope() as db:
        existing = await db.scalar(select(User).where(User.username == username))
        if existing is not None:
            print(f"[bootstrap] user '{username}' already exists — skipping")
            return
        db.add(User(
            username=username, email=email, password_hash=hash_password(password),
            role="ADMIN", is_active=True, totp_enabled=False,
        ))
        print(f"[bootstrap] admin '{username}' created. 2FA enrollment required on first login.")


if __name__ == "__main__":
    args = sys.argv[1:]
    asyncio.run(seed_admin(*args))

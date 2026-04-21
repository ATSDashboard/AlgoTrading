"""ORM models for users, broker credentials, sessions, demat accounts, heartbeats."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    telegram_chat_id: Mapped[str | None] = mapped_column(String(50))
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[str] = mapped_column(String(20), default="TRADER")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrokerCredential(Base):
    __tablename__ = "broker_credentials"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    broker: Mapped[str] = mapped_column(String(20))
    label: Mapped[str | None] = mapped_column(String(100))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    api_secret_encrypted: Mapped[str | None] = mapped_column(Text)
    client_id: Mapped[str | None] = mapped_column(String(100))
    extra_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    demats: Mapped[list[DematAccount]] = relationship(back_populates="credential",
                                                       cascade="all, delete-orphan")


class DematAccount(Base):
    __tablename__ = "demat_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    broker_cred_id: Mapped[int] = mapped_column(
        ForeignKey("broker_credentials.id", ondelete="CASCADE"))
    account_number: Mapped[str] = mapped_column(String(50))
    account_label: Mapped[str | None] = mapped_column(String(100))
    capital_allocated: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    daily_loss_cap: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    credential: Mapped[BrokerCredential] = relationship(back_populates="demats")


class BrokerSession(Base):
    __tablename__ = "broker_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    broker_cred_id: Mapped[int] = mapped_column(
        ForeignKey("broker_credentials.id", ondelete="CASCADE"))
    demat_account_id: Mapped[int | None] = mapped_column(ForeignKey("demat_accounts.id"))
    auth_token_encrypted: Mapped[str] = mapped_column(Text)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text)
    token_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UIHeartbeat(Base):
    __tablename__ = "ui_heartbeats"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                    server_default=func.now())
    user_agent: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(INET)

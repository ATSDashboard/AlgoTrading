"""Pydantic request/response schemas for auth endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    totp_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user_id: int
    role: str
    totp_enrolled: bool
    must_enroll_totp: bool                    # true on first-ever login


class RefreshRequest(BaseModel):
    refresh_token: str


class TOTPEnrollStart(BaseModel):
    secret: str
    provisioning_uri: str                      # for QR in frontend
    issuer: str


class TOTPEnrollVerify(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    totp_enabled: bool
    is_active: bool
    last_login_at: datetime | None

    class Config:
        from_attributes = True


class BrokerConnectRequest(BaseModel):
    broker: Literal["paper", "axis", "zerodha", "monarch", "jm"]
    credential_id: int                         # from Settings > Brokers
    demat_account_id: int


class BrokerConnectInitResponse(BaseModel):
    login_url: str
    state: str                                 # opaque CSRF token


class BrokerConnectCallback(BaseModel):
    state: str
    code: str


class BrokerSessionOut(BaseModel):
    id: int
    broker: str
    label: str | None
    demat_account: str | None
    token_expires_at: datetime
    is_active: bool

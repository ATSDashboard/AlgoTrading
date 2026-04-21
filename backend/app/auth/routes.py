"""Auth routes: login, refresh, 2FA, broker-session connect."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.dependencies import enforce_ip_allowlist, get_current_user
from app.auth.models import User
from app.auth.schemas import (
    BrokerConnectCallback, BrokerConnectInitResponse, BrokerConnectRequest,
    BrokerSessionOut, LoginRequest, LoginResponse, RefreshRequest,
    TOTPEnrollStart, TOTPEnrollVerify, UserOut,
)
from app.auth.security import create_access_token, create_refresh_token
from app.common.errors import AuthError, InvalidCredentials, InvalidTOTP
from app.common.types import BrokerName
from app.db import get_db

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    await enforce_ip_allowlist(request)
    try:
        user, must_enroll = await service.authenticate(
            db, body.username, body.password, body.totp_code,
        )
    except InvalidCredentials as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    except InvalidTOTP as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    except AuthError as e:
        raise HTTPException(status.HTTP_423_LOCKED, str(e)) from e

    return LoginResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        role=user.role,
        totp_enrolled=user.totp_enabled,
        must_enroll_totp=must_enroll,
    )


@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        token = await service.refresh_access_token(db, body.refresh_token)
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    return {"access_token": token, "token_type": "bearer"}


@router.post("/totp/begin", response_model=TOTPEnrollStart)
async def totp_begin(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> TOTPEnrollStart:
    data = await service.begin_totp_enrollment(db, user)
    return TOTPEnrollStart(**data)


@router.post("/totp/verify")
async def totp_verify(
    body: TOTPEnrollVerify,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    try:
        await service.confirm_totp_enrollment(db, user, body.code)
    except InvalidTOTP as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return {"totp_enabled": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


# ── Broker session ───────────────────────────────────────────────────────────
@router.post("/broker/connect/init", response_model=BrokerConnectInitResponse)
async def broker_connect_init(
    body: BrokerConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrokerConnectInitResponse:
    data = await service.init_broker_connect(
        db, user, BrokerName(body.broker), body.credential_id,
    )
    return BrokerConnectInitResponse(**data)


@router.post("/broker/connect/callback", response_model=BrokerSessionOut)
async def broker_connect_callback(
    body: BrokerConnectCallback,
    connect: BrokerConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BrokerSessionOut:
    session = await service.complete_broker_connect(
        db, user, BrokerName(connect.broker),
        connect.credential_id, connect.demat_account_id,
        body.code, body.state,
    )
    return BrokerSessionOut(
        id=session.id, broker=connect.broker, label=None,
        demat_account=str(connect.demat_account_id),
        token_expires_at=session.token_expires_at, is_active=session.is_active,
    )

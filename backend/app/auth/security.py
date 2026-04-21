"""Auth primitives: password hashing, JWT, TOTP, symmetric encryption of broker tokens."""
from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
import pyotp
from cryptography.fernet import Fernet

from app.common.errors import InvalidTOTP, TokenExpired
from app.config import get_settings

_settings = get_settings()


# ── Passwords ────────────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=_settings.bcrypt_rounds)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


# ── JWT ──────────────────────────────────────────────────────────────────────
def create_access_token(user_id: int, role: str, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=_settings.jwt_expiry_hours)).timestamp()),
        **(extra or {}),
    }
    return jwt.encode(payload, _settings.jwt_secret, algorithm="HS256")


def create_refresh_token(user_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=_settings.jwt_refresh_days)).timestamp()),
    }
    return jwt.encode(payload, _settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as e:
        raise TokenExpired("jwt expired") from e
    except jwt.InvalidTokenError as e:
        raise TokenExpired(f"jwt invalid: {e}") from e


# ── TOTP 2FA ─────────────────────────────────────────────────────────────────
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=_settings.totp_issuer)


def verify_totp(secret: str, code: str) -> None:
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        raise InvalidTOTP("TOTP code invalid or expired")


# ── Encryption (broker tokens at rest) ───────────────────────────────────────
def _fernet() -> Fernet:
    # Derive a 32-byte key from the app secret
    key = hashlib.sha256(_settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()

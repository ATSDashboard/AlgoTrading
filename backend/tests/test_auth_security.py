"""Auth primitive tests — password, JWT, TOTP, encryption."""
from __future__ import annotations

import time

import pyotp
import pytest

from app.auth import security
from app.common.errors import InvalidTOTP, TokenExpired


def test_password_roundtrip() -> None:
    h = security.hash_password("correct horse battery staple")
    assert security.verify_password("correct horse battery staple", h)
    assert not security.verify_password("wrong password", h)


def test_jwt_roundtrip() -> None:
    t = security.create_access_token(42, "TRADER")
    payload = security.decode_token(t)
    assert payload["sub"] == "42"
    assert payload["role"] == "TRADER"
    assert payload["type"] == "access"


def test_refresh_token_type() -> None:
    t = security.create_refresh_token(42)
    p = security.decode_token(t)
    assert p["type"] == "refresh"


def test_expired_token_raises() -> None:
    import jwt

    from app.config import get_settings
    s = get_settings()
    bad = jwt.encode({"sub": "1", "type": "access", "exp": int(time.time()) - 10},
                     s.jwt_secret, algorithm="HS256")
    with pytest.raises(TokenExpired):
        security.decode_token(bad)


def test_totp_enroll_verify() -> None:
    secret = security.generate_totp_secret()
    code = pyotp.TOTP(secret).now()
    security.verify_totp(secret, code)


def test_totp_wrong_code_raises() -> None:
    secret = security.generate_totp_secret()
    with pytest.raises(InvalidTOTP):
        security.verify_totp(secret, "000000")


def test_encryption_roundtrip() -> None:
    ct = security.encrypt("super-secret-broker-token")
    assert ct != "super-secret-broker-token"
    assert security.decrypt(ct) == "super-secret-broker-token"

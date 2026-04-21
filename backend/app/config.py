"""Application configuration — all values env-driven, no magic numbers in code."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # App
    app_env: Literal["paper", "live"] = "paper"
    app_version: str = "1.0.0"
    log_level: str = "INFO"
    secret_key: str = "change-me"
    timezone: str = "Asia/Kolkata"

    # Auth
    jwt_secret: str = "change-me-jwt"
    jwt_expiry_hours: int = 8
    jwt_refresh_days: int = 7
    totp_issuer: str = "ThetaGainers"
    ip_allowlist: str = ""
    bcrypt_rounds: int = 12

    # Database / cache
    database_url: str = "postgresql+asyncpg://navin:navin@localhost:5432/navin_algo"
    redis_url: str = "redis://localhost:6379/0"

    # SEBI / exchange compliance
    sebi_algo_id: str = ""
    orders_per_sec_per_user: int = 8
    orders_per_sec_global: int = 20
    otr_halt_threshold: int = 100
    nifty_freeze_qty: int = 1800
    sensex_freeze_qty: int = 1000
    nifty_lot_size: int = 65
    sensex_lot_size: int = 20
    iceberg_slice_jitter_ms: int = 100

    # Risk caps (cannot be raised via UI — only via env + admin approval)
    max_lots_per_strategy: int = 10
    max_active_strategies_per_user: int = 5
    max_active_strategies_global: int = 25
    max_daily_loss_per_user: float = 50_000
    max_daily_loss_global: float = 500_000
    circuit_breaker_error_threshold: int = 3
    cooling_off_minutes_after_halt: int = 30
    dead_man_switch_seconds: int = 120
    mtm_drawdown_kill_pct: float = 40.0
    two_person_approval_min_lots: int = 5
    hedge_legs_default_on: bool = False

    # Brokers
    broker_enabled: str = "paper,axis,zerodha,monarch,jm"
    axis_client_id: str = ""
    axis_auth_key: str = ""
    axis_api_base: str = "https://api.axisdirect.in"
    zerodha_api_key: str = ""
    zerodha_api_secret: str = ""
    monarch_api_key: str = ""
    monarch_api_secret: str = ""
    jm_api_key: str = ""
    jm_api_secret: str = ""

    # Notifications
    gupshup_api_key: str = ""
    gupshup_source: str = ""
    telegram_bot_token: str = ""
    aws_ses_region: str = "ap-south-1"
    aws_ses_from: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # AWS
    aws_region: str = "ap-south-1"
    s3_bucket_backups: str = ""
    s3_bucket_audit_anchors: str = ""
    sentry_dsn: str = ""
    cloudwatch_log_group: str = ""

    @property
    def enabled_brokers(self) -> list[str]:
        return [b.strip().lower() for b in self.broker_enabled.split(",") if b.strip()]

    @property
    def is_live(self) -> bool:
        return self.app_env == "live"

    def freeze_qty_for(self, underlying: str) -> int:
        return self.nifty_freeze_qty if underlying.upper() == "NIFTY" else self.sensex_freeze_qty

    def lot_size_for(self, underlying: str) -> int:
        return self.nifty_lot_size if underlying.upper() == "NIFTY" else self.sensex_lot_size


@lru_cache
def get_settings() -> Settings:
    return Settings()

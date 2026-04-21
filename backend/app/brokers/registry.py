"""Broker registry. Strategy code calls `get_broker(name)` — nothing else."""
from __future__ import annotations

from app.brokers.base import BrokerClient
from app.brokers.paper import PaperBroker
from app.common.errors import BrokerError
from app.common.types import BrokerName
from app.config import get_settings

from app.brokers.zerodha import ZerodhaBroker
# Stubs — implemented in M3+
# from app.brokers.axis import AxisBroker
# from app.brokers.monarch import MonarchBroker
# from app.brokers.jm import JMBroker

_registry: dict[BrokerName, BrokerClient] = {}


def _build_registry() -> None:
    settings = get_settings()
    enabled = {b for b in settings.enabled_brokers}

    # Paper is always available
    _registry[BrokerName.PAPER] = PaperBroker()

    # Zerodha: wired. Requires api_key+secret in env; access_token obtained per-user on login.
    if "zerodha" in enabled and settings.zerodha_api_key and settings.zerodha_api_secret:
        try:
            _registry[BrokerName.ZERODHA] = ZerodhaBroker(settings)
        except Exception:
            pass  # missing creds in dev — don't crash boot
    # Others wired later:
    # if "axis" in enabled:    _registry[BrokerName.AXIS] = AxisBroker(settings)
    # if "monarch" in enabled: _registry[BrokerName.MONARCH] = MonarchBroker(settings)
    # if "jm" in enabled:      _registry[BrokerName.JM] = JMBroker(settings)


def get_broker(name: BrokerName | str) -> BrokerClient:
    if not _registry:
        _build_registry()
    key = BrokerName(name) if isinstance(name, str) else name
    if key not in _registry:
        raise BrokerError(f"broker {key} not enabled or not implemented yet")
    return _registry[key]


def list_brokers() -> list[BrokerName]:
    if not _registry:
        _build_registry()
    return list(_registry.keys())

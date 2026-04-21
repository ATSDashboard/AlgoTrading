"""JM Financial (Blink) adapter — STUB. Wired in M3 against JM Blink API."""
from __future__ import annotations

from app.brokers.base import BrokerClient
from app.common.types import BrokerName


class JMBroker(BrokerClient):  # noqa: PLR0904
    name = BrokerName.JM

    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        raise NotImplementedError("JMBroker implemented in M3")

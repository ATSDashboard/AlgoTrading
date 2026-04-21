"""Monarch Networth adapter — STUB. Wired in M3 against SuperTrader/API docs."""
from __future__ import annotations

from app.brokers.base import BrokerClient
from app.common.types import BrokerName


class MonarchBroker(BrokerClient):  # noqa: PLR0904
    name = BrokerName.MONARCH

    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        raise NotImplementedError("MonarchBroker implemented in M3")

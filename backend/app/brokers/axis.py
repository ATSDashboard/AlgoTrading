"""Axis Direct RAPID adapter — STUB. Wired in M3 against real API docs.

Implements the BrokerClient contract. Reference:
https://simulator.axisdirect.in/rapid-docs (replace with prod URL)
"""
from __future__ import annotations

from app.brokers.base import BrokerClient
from app.common.types import BrokerName


class AxisBroker(BrokerClient):  # noqa: PLR0904 — stub, will fill in M3
    name = BrokerName.AXIS

    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        self._s = settings
        raise NotImplementedError("AxisBroker implemented in M3")

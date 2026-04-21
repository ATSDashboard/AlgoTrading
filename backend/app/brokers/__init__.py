"""Broker abstraction layer. Strategy code depends ONLY on BrokerClient ABC."""
from app.brokers.base import BrokerClient, Quote, OrderRequest, OrderAck, Position, MarginInfo
from app.brokers.registry import get_broker, list_brokers

__all__ = ["BrokerClient", "Quote", "OrderRequest", "OrderAck", "Position",
           "MarginInfo", "get_broker", "list_brokers"]

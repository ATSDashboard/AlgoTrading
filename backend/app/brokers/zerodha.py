"""Zerodha Kite Connect v3 adapter.

Docs: https://kite.trade/docs/connect/v3/
Auth flow:
  1. Redirect user to https://kite.zerodha.com/connect/login?api_key=X&v=3
  2. User logs in; Kite redirects to registered callback with ?request_token=RT
  3. POST /session/token with api_key + request_token + checksum(SHA256(api_key+RT+api_secret))
     → {access_token, refresh_token, ...}
  4. All subsequent API calls use header `Authorization: token API_KEY:ACCESS_TOKEN`

Access token is valid until market close next day (~6AM IST). No silent refresh —
user must re-login daily (Zerodha's design). We surface expiry in the UI.
"""
from __future__ import annotations

import csv
import hashlib
import io
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.brokers.base import (
    BrokerClient, Instrument, MarginInfo, OrderAck, OrderRequest, OrderUpdate,
    Position, Quote,
)
from app.common.errors import (
    BrokerDown, BrokerError, BrokerSessionExpired, InsufficientMargin,
    InvalidSymbol, OrderRejected,
)
from app.common.types import (
    BrokerName, OptionType, OrderAction, OrderStatus, OrderType, Underlying,
)

_KITE_BASE = "https://api.kite.trade"
_KITE_LOGIN = "https://kite.zerodha.com/connect/login"
_TIMEOUT = 10.0


class ZerodhaBroker(BrokerClient):
    """Kite Connect v3 adapter."""

    name = BrokerName.ZERODHA

    # Kite returns these strings; map to our enums.
    _STATUS_MAP = {
        "COMPLETE": OrderStatus.FILLED,
        "OPEN": OrderStatus.OPEN,
        "TRIGGER PENDING": OrderStatus.OPEN,
        "CANCELLED": OrderStatus.CANCELLED,
        "REJECTED": OrderStatus.REJECTED,
        "PUT ORDER REQ RECEIVED": OrderStatus.SUBMITTED,
        "VALIDATION PENDING": OrderStatus.SUBMITTED,
        "OPEN PENDING": OrderStatus.SUBMITTED,
    }

    def __init__(self, settings: Any, access_token: str | None = None) -> None:
        self._api_key = settings.zerodha_api_key
        self._api_secret = settings.zerodha_api_secret
        self._access_token = access_token
        if not self._api_key or not self._api_secret:
            raise BrokerError("zerodha: api key/secret missing in env")

    # ── HTTP helper ──────────────────────────────────────────────────────
    def _headers(self) -> dict[str, str]:
        if not self._access_token:
            raise BrokerSessionExpired("zerodha: no access token")
        return {
            "Authorization": f"token {self._api_key}:{self._access_token}",
            "X-Kite-Version": "3",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=0.1, max=2.0),
           reraise=True)
    async def _call(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{_KITE_BASE}{path}"
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            try:
                r = await c.request(method, url, headers=self._headers(), **kwargs)
            except httpx.HTTPError as e:
                raise BrokerDown(f"zerodha network error: {e}") from e
        if r.status_code == 403 and "token" in r.text.lower():
            raise BrokerSessionExpired("zerodha: access token expired/invalid")
        if r.status_code >= 400:
            raise BrokerError(f"zerodha {r.status_code}: {r.text[:200]}")
        data = r.json()
        if data.get("status") == "error":
            raise BrokerError(f"zerodha: {data.get('message')}")
        return data["data"]

    # ── Auth ─────────────────────────────────────────────────────────────
    async def login_url(self, state: str) -> str:
        return f"{_KITE_LOGIN}?api_key={self._api_key}&v=3&state={state}"

    async def exchange_code(self, code: str, state: str) -> dict[str, Any]:
        """`code` here is Zerodha's `request_token` from the callback URL."""
        checksum = hashlib.sha256(
            (self._api_key + code + self._api_secret).encode()
        ).hexdigest()
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"{_KITE_BASE}/session/token",
                             headers={"X-Kite-Version": "3"},
                             data={"api_key": self._api_key,
                                   "request_token": code,
                                   "checksum": checksum})
        if r.status_code != 200:
            raise BrokerError(f"zerodha session exchange failed: {r.status_code} {r.text[:200]}")
        d = r.json()["data"]
        self._access_token = d["access_token"]
        return {
            "token": d["access_token"],
            "refresh": d.get("refresh_token", ""),
            # Kite token expires next trading day ~06:00 IST. Be conservative: 08:00 IST UTC.
            "expires_at": datetime.combine(date.today() + timedelta(days=1),
                                           time(2, 30), tzinfo=UTC),
        }

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        # Kite Connect v3 does not support silent refresh for retail. User must re-login.
        raise BrokerSessionExpired(
            "zerodha requires re-login daily — no silent refresh supported"
        )

    # ── Security master ──────────────────────────────────────────────────
    async def fetch_security_master(self) -> list[Instrument]:
        """Kite returns a CSV at /instruments. Filter to NIFTY/SENSEX options only."""
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.get(f"{_KITE_BASE}/instruments", headers=self._headers())
        if r.status_code != 200:
            raise BrokerError(f"zerodha instruments: {r.status_code}")

        reader = csv.DictReader(io.StringIO(r.text))
        out: list[Instrument] = []
        for row in reader:
            if row["instrument_type"] not in ("CE", "PE"):
                continue
            name = row["name"]
            seg = row["segment"]
            if name == "NIFTY" and seg == "NFO-OPT":
                und, exch = Underlying.NIFTY, "NFO"
            elif name == "SENSEX" and seg == "BFO-OPT":
                und, exch = Underlying.SENSEX, "BFO"
            else:
                continue
            try:
                exp = datetime.strptime(row["expiry"], "%Y-%m-%d").date()
            except ValueError:
                continue
            out.append(Instrument(
                script_id=row["instrument_token"],
                exchange=exch,
                underlying=und,
                expiry=exp,
                strike=Decimal(row["strike"]),
                option_type=OptionType(row["instrument_type"]),
                lot_size=int(row["lot_size"]),
                tick_size=Decimal(row["tick_size"]),
                # Kite doesn't publish freeze qty; fall back to env defaults elsewhere.
                freeze_qty=1800 if und == Underlying.NIFTY else 1000,
                trading_symbol=row["tradingsymbol"],
            ))
        return out

    # ── Quotes ───────────────────────────────────────────────────────────
    async def get_quote(self, instrument: Instrument) -> Quote:
        quotes = await self.get_quotes([instrument])
        return quotes[0]

    async def get_quotes(self, instruments: list[Instrument]) -> list[Quote]:
        if not instruments:
            return []
        # Kite accepts multiple `i` params; key format `<exch>:<tradingsymbol>`
        params = [("i", f"{i.exchange}:{i.trading_symbol}") for i in instruments]
        data = await self._call("GET", "/quote", params=params)

        out: list[Quote] = []
        for inst in instruments:
            key = f"{inst.exchange}:{inst.trading_symbol}"
            q = data.get(key)
            if q is None:
                raise InvalidSymbol(f"zerodha: no quote for {key}")
            depth = q.get("depth", {})
            buy = depth.get("buy", [{}])
            sell = depth.get("sell", [{}])
            out.append(Quote(
                instrument_id=0,
                script_id=str(q["instrument_token"]),
                ltp=Decimal(str(q["last_price"])),
                bid=Decimal(str(buy[0].get("price", 0))),
                ask=Decimal(str(sell[0].get("price", 0))),
                bid_qty=int(buy[0].get("quantity", 0)),
                ask_qty=int(sell[0].get("quantity", 0)),
                volume=int(q.get("volume", 0)),
                oi=int(q.get("oi", 0)),
                ts=datetime.now(UTC),
            ))
        return out

    # ── Orders ───────────────────────────────────────────────────────────
    async def place_order(self, req: OrderRequest) -> OrderAck:
        # Kite supports `tag` up to 20 chars — perfect for our algo ID + short ref
        tag = f"{req.sebi_algo_tag[:10]}:{req.client_ref_id[-8:]}"[:20]
        body = {
            "tradingsymbol": req.instrument.trading_symbol,
            "exchange": req.instrument.exchange,
            "transaction_type": "BUY" if req.action == OrderAction.BUY else "SELL",
            "order_type": "LIMIT",              # we never send MARKET on options
            "quantity": req.quantity,
            "product": "NRML",                   # carry overnight allowed
            "price": float(req.limit_price),
            "validity": "DAY",
            "tag": tag,
        }
        try:
            data = await self._call("POST", "/orders/regular", data=body)
        except BrokerError as e:
            msg = str(e).lower()
            if "margin" in msg:
                raise InsufficientMargin(str(e)) from e
            if "reject" in msg:
                raise OrderRejected(str(e)) from e
            raise

        bo_id = str(data["order_id"])
        return OrderAck(bo_id, OrderStatus.SUBMITTED,
                        {"kite": data, "client_ref_id": req.client_ref_id})

    async def modify_order(self, broker_order_id: str, new_price: Decimal) -> OrderAck:
        data = await self._call("PUT", f"/orders/regular/{broker_order_id}",
                                data={"price": float(new_price),
                                      "order_type": "LIMIT"})
        return OrderAck(broker_order_id, OrderStatus.SUBMITTED, {"kite": data})

    async def cancel_order(self, broker_order_id: str) -> OrderAck:
        data = await self._call("DELETE", f"/orders/regular/{broker_order_id}")
        return OrderAck(broker_order_id, OrderStatus.CANCELLED, {"kite": data})

    async def get_order(self, broker_order_id: str) -> OrderUpdate:
        data = await self._call("GET", f"/orders/{broker_order_id}")
        # Kite returns a list of state-transitions; last entry is current state
        latest = data[-1] if isinstance(data, list) and data else data
        return OrderUpdate(
            broker_order_id=broker_order_id,
            status=self._STATUS_MAP.get(latest.get("status", ""), OrderStatus.ERROR),
            filled_qty=int(latest.get("filled_quantity", 0)),
            avg_fill_price=(Decimal(str(latest["average_price"]))
                            if latest.get("average_price") else None),
            rejection_reason=latest.get("status_message"),
            ts=datetime.now(UTC),
        )

    async def get_positions(self, demat_account: str) -> list[Position]:
        data = await self._call("GET", "/portfolio/positions")
        # Kite returns {"net": [...], "day": [...]} — we track `net` positions
        out: list[Position] = []
        for p in data.get("net", []):
            if p.get("quantity", 0) == 0:
                continue
            out.append(Position(
                script_id=str(p["instrument_token"]),
                quantity=int(p["quantity"]),
                avg_price=Decimal(str(p.get("average_price", 0))),
                ltp=Decimal(str(p.get("last_price", 0))),
                mtm_pnl=Decimal(str(p.get("pnl", 0))),
            ))
        return out

    async def get_margin(
        self, demat_account: str, orders: list[OrderRequest]
    ) -> MarginInfo:
        """Uses Kite's basket margin endpoint — accurate SPAN + Exposure + hedge benefit."""
        basket = [
            {
                "exchange": o.instrument.exchange,
                "tradingsymbol": o.instrument.trading_symbol,
                "transaction_type": "BUY" if o.action == OrderAction.BUY else "SELL",
                "variety": "regular",
                "product": "NRML",
                "order_type": "LIMIT",
                "quantity": o.quantity,
                "price": float(o.limit_price),
            }
            for o in orders
        ]
        data = await self._call("POST", "/margins/basket",
                                json=basket,
                                params={"consider_positions": "true"})
        # Kite returns {initial: {...}, final: {...}} — `final` nets hedge benefit
        initial = data.get("initial", {})
        final = data.get("final", {})
        span = Decimal(str(initial.get("span", 0)))
        exposure = Decimal(str(initial.get("exposure", 0)))
        final_total = Decimal(str(final.get("total", span + exposure)))
        hedge_benefit = (span + exposure) - final_total

        funds = await self._call("GET", "/user/margins/equity")
        available = Decimal(str(funds.get("net", 0)))

        return MarginInfo(
            available=available,
            required=final_total,
            span_margin=span,
            exposure_margin=exposure,
            hedge_benefit=max(hedge_benefit, Decimal(0)),
        )

    async def ping(self) -> bool:
        try:
            await self._call("GET", "/user/profile")
            return True
        except Exception:
            return False

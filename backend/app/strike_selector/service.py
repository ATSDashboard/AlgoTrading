"""Live evaluation: fetch chain + snapshot, run engine, log evaluations.

In production this pulls the chain from the data service (broker or cache).
Today it uses the synthetic chain generator so the full path is testable.
"""
from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta

from app.config import get_settings
from app.strike_selector.engine import evaluate_chain, evaluate_pair
from app.strike_selector.filters import MarketCtx, StrikeRow

_s = get_settings()


async def evaluate_live(underlying: str, expiry: str | None, rule: dict,
                         mode: str, target_side: str) -> dict:
    chain, market = _synthetic_live_snapshot(underlying, expiry)

    if mode == "PAIR":
        lot = _s.nifty_lot_size if underlying == "NIFTY" else _s.sensex_lot_size
        margin_per_lot = 108_000 if underlying == "NIFTY" else 180_000   # rough; real number comes from broker
        results = evaluate_pair(chain, market, rule, lot_size=lot,
                                 margin_per_lot=margin_per_lot)
        return {
            "mode": "PAIR",
            "underlying": underlying,
            "market_snapshot": {
                "spot": market.spot, "futures": market.futures, "vix": market.vix,
                "pcr": market.oi_pcr, "max_pain": market.max_pain,
                "expected_move": market.expected_move, "dte": market.dte,
            },
            "candidates": results[:20],   # top 20
            "total_matched": sum(1 for r in results if r["passed"]),
        }

    # SINGLE_SIDE
    candidates = evaluate_chain(chain, market, rule, target_side=target_side)
    return {
        "mode": "SINGLE_SIDE", "underlying": underlying,
        "target_side": target_side,
        "market_snapshot": {"spot": market.spot, "vix": market.vix,
                            "dte": market.dte, "expected_move": market.expected_move},
        "candidates": [
            {
                "strike": c.strike.strike, "option_type": c.strike.option_type,
                "ltp": c.strike.ltp, "oi": c.strike.oi, "passed": c.passed,
                "evaluations": [e.__dict__ for e in c.evaluations],
                "score": c.score, "rank_reason": c.rank_reason,
            }
            for c in candidates[:20]
        ],
        "total_matched": sum(1 for c in candidates if c.passed),
    }


def _synthetic_live_snapshot(underlying: str, expiry_str: str | None):
    """Until broker adapters ship, use deterministic synthetic chain."""
    spot = 24812.40 if underlying == "NIFTY" else 81204.15
    step = 50 if underlying == "NIFTY" else 100
    today = date.today()
    expiry = date.fromisoformat(expiry_str) if expiry_str else (
        today + timedelta(days=(3 - today.weekday()) % 7 or 7)
    )
    dte = max(1, (expiry - today).days)
    vix = 13.24
    expected_move = spot * (vix / 100) / math.sqrt(252) * math.sqrt(dte) * 1.5

    chain: list[StrikeRow] = []
    for off in range(-30, 31):
        k = spot + off * step
        for opt in ("CE", "PE"):
            distance = abs(k - spot)
            decay = max(0.05, 180 * math.exp(-((distance / 400) ** 2)))
            oi = int(max(50_000, 3_000_000 - distance * 400
                         + (1_500_000 if off in (-10, -6, 4, 8) else 0)))
            spread = max(0.1, decay * 0.02)
            chain.append(StrikeRow(
                strike=k, option_type=opt, ltp=decay,
                bid=decay - spread/2, ask=decay + spread/2,
                oi=oi, oi_change_pct=70 if off in (8, -10) else 25,
                volume=int(10_000 * math.exp(-((distance / 300) ** 2))),
                iv=16.5,
                delta=0.5 * math.exp(-((distance / 500) ** 2)) * (1 if opt == "CE" else -1),
            ))

    market = MarketCtx(
        spot=spot, futures=spot + 25, vix=vix, vix_change_pct=-1.8,
        oi_pcr=1.11, vol_pcr=0.98, max_pain=spot, dte=dte,
        expected_move=expected_move, ivr_percentile=45.0,
        technical_support=[spot - 100, spot - 400, spot - 700],
        technical_resistance=[spot + 200, spot + 600, spot + 1000],
    )
    return chain, market

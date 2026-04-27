"""Analytics API — market snapshot + Deep OTM recommendations.

Phase 3 preview. Real market data ingestion (Quantsapp / NSE / news feed) wired
in M8+; for now we return deterministic synthetic data so UI can be built first.
"""
from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.analytics.deep_otm import (
    MarketSnapshot, Recommendation, StrikeData, Tier, TIER_LABELS, expected_move, recommend,
)
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.config import get_settings

router = APIRouter()
_settings = get_settings()


class MarketOut(BaseModel):
    nifty_spot: float
    sensex_spot: float
    vix: float
    vix_change_pct: float
    oi_pcr_nifty: float
    max_pain_nifty: float
    max_pain_sensex: float
    breadth_advance_decline: str
    fii_dii_net: str                          # today's flows (equity cash)
    expected_move_weekly: float
    news_headlines: list[dict]                # breaking news scroll


class RecommendationOut(BaseModel):
    tier: int
    tier_label: str
    ce_strike: float | None
    ce_premium: float | None
    ce_oi: int | None
    ce_cushion_ratio: float | None
    pe_strike: float | None
    pe_premium: float | None
    pe_oi: int | None
    pe_cushion_ratio: float | None
    combined_premium_per_lot: float
    probability_otm_estimate: float
    score_ce: int
    score_pe: int
    notes: list[str]


@router.get("/market", response_model=MarketOut)
async def market(_: User = Depends(get_current_user)) -> MarketOut:
    return MarketOut(
        nifty_spot=24812.40, sensex_spot=81204.15,
        vix=13.24, vix_change_pct=-1.8,
        oi_pcr_nifty=1.11,
        max_pain_nifty=24800, max_pain_sensex=81000,
        breadth_advance_decline="1,482 / 1,083",
        fii_dii_net="FII -₹842Cr · DII +₹1,240Cr",
        expected_move_weekly=round(expected_move(24812.40, 13.24, 3), 1),
        news_headlines=[
            {"t": "09:32", "src": "NSE", "text": "India VIX eased to 13.2, lowest in 3 weeks"},
            {"t": "09:18", "src": "Reuters", "text": "Fed minutes expected Wed; no change priced in"},
            {"t": "Yday", "src": "SEBI", "text": "Algo-order tagging: OTR cap at 500 reminded for Apr expiry"},
            {"t": "Yday", "src": "Mint", "text": "FPI flows turn positive for financials after RBI comments"},
        ],
    )


class DeepOTMRequest(BaseModel):
    underlying: Literal["NIFTY", "SENSEX"] = "NIFTY"
    expiry: date | None = None                # defaults to next Thursday
    is_monthly: bool = False


@router.post("/deep-otm", response_model=list[RecommendationOut])
async def deep_otm(req: DeepOTMRequest, _: User = Depends(get_current_user)) -> list[RecommendationOut]:
    """Synthetic recommendations for now — real chain + Max Pain wired in M8."""
    spot = 24800.0 if req.underlying == "NIFTY" else 81200.0
    step = 50 if req.underlying == "NIFTY" else 100
    lot = _settings.nifty_lot_size if req.underlying == "NIFTY" else _settings.sensex_lot_size
    dte = ((req.expiry or (date.today() + timedelta(days=(3 - date.today().weekday()) % 7 or 7)))
           - date.today()).days or 3

    chain: list[StrikeData] = []
    for off in range(-30, 31):
        k = spot + off * step
        for opt in ("CE", "PE"):
            distance = abs(k - spot)
            decay = max(0.05, 180 * math.exp(-(distance / 400) ** 2))
            chain.append(StrikeData(
                strike=k, option_type=opt, ltp=decay, bid=decay-0.5, ask=decay+0.5,
                oi=int(max(50_000, 3_000_000 - distance * 400 + (1_500_000 if off in (-10, -6, 4, 8) else 0))),
                oi_change_pct=(70 if off in (8, -10) else 25),
                volume=int(10_000 * math.exp(-(distance/300)**2)),
                iv=16.5,
            ))

    snap = MarketSnapshot(
        spot=spot, futures=spot + 25, max_pain=spot + 0.0,
        oi_pcr=1.11, vol_pcr=0.98, vix=13.24, vix_change_pct=-1.8,
        technical_support=[spot - 100, spot - 400, spot - 700],
        technical_resistance=[spot + 200, spot + 600, spot + 1000],
        dte=dte, is_monthly=req.is_monthly,
    )
    recs = recommend(chain, snap, lot)
    return [RecommendationOut(tier=int(r.tier), tier_label=r.tier_label,
                               ce_strike=r.ce_strike, ce_premium=r.ce_premium, ce_oi=r.ce_oi,
                               ce_cushion_ratio=r.ce_cushion_ratio,
                               pe_strike=r.pe_strike, pe_premium=r.pe_premium, pe_oi=r.pe_oi,
                               pe_cushion_ratio=r.pe_cushion_ratio,
                               combined_premium_per_lot=r.combined_premium_per_lot,
                               probability_otm_estimate=r.probability_otm_estimate,
                               score_ce=r.score_ce, score_pe=r.score_pe, notes=r.notes)
            for r in recs]

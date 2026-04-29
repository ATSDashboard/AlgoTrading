"""
Broker / Demat / Margin endpoints — Phase 2 stubs.

Wires the new Trade page features to live broker sessions:
  GET  /broker/list                       all configured brokers
  GET  /broker/{broker}/demats            demats for a broker (assigned to me)
  GET  /broker/margin/summary             aggregate margin across my demats
  POST /broker/margin/allocate            preview allocation for a budget+cushion

These return realistic mock responses today; swap with broker.session
calls (Zerodha Kite, Axis RAPID, etc.) when broker auth is wired
end-to-end. Contract is stable — frontend hooks will not change.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.brokers.registry import list_brokers

router = APIRouter()


# ── Schema ────────────────────────────────────────────────────────────────

class DematOut(BaseModel):
    id: str
    label: str
    cap: str
    assigned: bool
    balance: int = Field(..., description="Live margin available in this demat (₹)")


class BrokerOut(BaseModel):
    id: str
    label: str
    connected: bool


class MarginSummary(BaseModel):
    total: int
    used_by_active: int
    blocked_by_orders: int
    free: int


class AllocationRequest(BaseModel):
    demat_ids: list[str]
    budget_cr: float = Field(0, ge=0, description="0 = use all available")
    cushion_pct: float = Field(5, ge=0, le=50)
    cushion_min: int = Field(500_000, ge=0)


class AllocationLine(BaseModel):
    demat_id: str
    balance: int
    cushion: int
    deployable: int
    allocated: int


class AllocationOut(BaseModel):
    total_deployable: int
    total_allocated: int
    capped_by_budget: bool
    lines: list[AllocationLine]


# ── Mock data (replace with broker.session lookups) ───────────────────────

_DEMATS: dict[str, list[dict]] = {
    "paper":   [{"id": "PAPER-001",  "label": "Paper Account",    "cap": "Unlimited", "assigned": True,  "balance": 100_000_00}],  # ₹1Cr
    "axis":    [{"id": "1234567890", "label": "Rohan Individual", "cap": "₹5L/day",   "assigned": True,  "balance": 15_00_000},
                {"id": "9876543210", "label": "Rohan HUF",        "cap": "₹2L/day",   "assigned": True,  "balance": 8_00_000}],
    "zerodha": [{"id": "ZD12345",    "label": "Rohan Kite",       "cap": "₹3L/day",   "assigned": True,  "balance": 22_00_000},
                {"id": "ZD67890",    "label": "Navin HUF",        "cap": "₹4L/day",   "assigned": True,  "balance": 11_00_000}],
    "monarch": [{"id": "MN98765",    "label": "Rohan Monarch",    "cap": "₹5L/day",   "assigned": True,  "balance": 6_00_000}],
    "jm":      [{"id": "JM45678",    "label": "Rohan JM Blink",   "cap": "₹2L/day",   "assigned": False, "balance": 0}],
}

_BROKER_LABELS = {
    "paper":   "Paper Broker (mock)",
    "axis":    "Axis Direct (RAPID)",
    "zerodha": "Zerodha (Kite Connect)",
    "monarch": "Monarch Networth",
    "jm":      "JM Financial (Blink)",
}


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/list", response_model=list[BrokerOut])
async def list_all_brokers(_user=Depends(get_current_user)) -> list[BrokerOut]:
    """All brokers configured in the system."""
    return [
        BrokerOut(id=b.value, label=_BROKER_LABELS.get(b.value, b.value), connected=b.value in _DEMATS)
        for b in list_brokers()
    ]


@router.get("/{broker}/demats", response_model=list[DematOut])
async def get_demats(broker: str, _user=Depends(get_current_user)) -> list[DematOut]:
    """Demats this user has access to for a given broker."""
    if broker not in _DEMATS:
        raise HTTPException(404, f"unknown broker: {broker}")
    return [DematOut(**d) for d in _DEMATS[broker]]


@router.get("/margin/summary", response_model=MarginSummary)
async def margin_summary(_user=Depends(get_current_user)) -> MarginSummary:
    """Aggregate margin snapshot across the user's assigned demats."""
    # In production: read from positions service + broker margin endpoints.
    return MarginSummary(
        total=10_00_000,
        used_by_active=3_25_000,
        blocked_by_orders=45_000,
        free=10_00_000 - 3_25_000 - 45_000,
    )


@router.post("/margin/allocate", response_model=AllocationOut)
async def preview_allocation(req: AllocationRequest, _user=Depends(get_current_user)) -> AllocationOut:
    """
    Preview the per-demat allocation for a budget + cushion config.
    Mirrors the frontend MarginAllocation component math so the UI and
    backend agree on what will actually deploy.
    """
    all_demats = {d["id"]: d for demats in _DEMATS.values() for d in demats}
    selected = [all_demats[i] for i in req.demat_ids if i in all_demats]
    if not selected:
        raise HTTPException(400, "no valid demats selected")

    lines: list[AllocationLine] = []
    total_deployable = 0
    for d in selected:
        cushion = int(max(d["balance"] * req.cushion_pct / 100, req.cushion_min))
        deployable = max(0, d["balance"] - cushion)
        total_deployable += deployable
        lines.append(AllocationLine(
            demat_id=d["id"],
            balance=d["balance"],
            cushion=cushion,
            deployable=deployable,
            allocated=0,  # populated below
        ))

    cap = total_deployable
    capped_by_budget = False
    if req.budget_cr > 0:
        budget_rs = int(req.budget_cr * 1_00_00_000)
        if budget_rs < total_deployable:
            cap = budget_rs
            capped_by_budget = True

    # Weighted-by-deployable split
    total_allocated = 0
    for line in lines:
        if total_deployable == 0:
            line.allocated = 0
        else:
            line.allocated = int(cap * line.deployable / total_deployable)
        total_allocated += line.allocated

    return AllocationOut(
        total_deployable=total_deployable,
        total_allocated=total_allocated,
        capped_by_budget=capped_by_budget,
        lines=lines,
    )

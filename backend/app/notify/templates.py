"""Message templates for Telegram / WhatsApp push — one per event type.

Keep lines short for mobile. Use emoji as visual anchors.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


def fmt(event: str, data: dict[str, Any]) -> str:
    """Return formatted multi-line message body for a given event."""
    fn = _RENDERERS.get(event, _default)
    return fn(data)


def _default(d: dict) -> str:
    lines = [f"📢 {d.get('event','event')}"]
    for k, v in d.items():
        if k != "event":
            lines.append(f"{k}: {v}")
    return "\n".join(lines)


def _trade_entered(d: dict) -> str:
    legs = "\n".join(f"• {l}" for l in d.get("legs", []))
    return (
        f"🟢 Strategy #{d.get('strategy_id','?')} started\n"
        f"{d.get('underlying','')} {d.get('kind','')}\n"
        f"{legs}\n"
        f"Credit ₹{d.get('credit',0):,.0f} · Margin ₹{d.get('margin',0)/100000:.1f}L\n"
        f"Target ₹{d.get('target',0):,} · SL ₹{d.get('sl',0):,}\n"
        f"Exit by {d.get('squareoff','15:15')} IST"
    )


def _trade_exited(d: dict) -> str:
    pnl = d.get("final_pnl", 0)
    sign = "+" if pnl >= 0 else ""
    emoji = "✅" if pnl >= 0 else "❌"
    return (
        f"{emoji} Strategy #{d.get('strategy_id','?')} closed\n"
        f"Reason: {d.get('reason','-')}\n"
        f"Final P&L: {sign}₹{pnl:,.0f} · Duration: {d.get('duration','?')}\n"
        + "\n".join(f"{l}: {p}" for l, p in d.get("per_leg", {}).items())
    )


def _sl_hit(d: dict) -> str:
    return (
        f"⚠️ SL HIT — Strategy #{d.get('strategy_id','?')}\n"
        f"P&L: ₹{d.get('pnl',0):,.0f} (≤ -₹{d.get('sl',0):,})\n"
        f"Flattening both legs now."
    )


def _kill_switch(d: dict) -> str:
    return (
        f"🛑 KILL SWITCH activated\n"
        f"Scope: {d.get('scope','all')}\n"
        f"Reason: {d.get('reason','manual')}\n"
        f"All positions closing."
    )


def _dead_man(d: dict) -> str:
    return (
        f"🚨 DEAD-MAN SWITCH fired\n"
        f"UI heartbeat missed for {d.get('seconds','?')}s\n"
        f"{d.get('strategies_closed',0)} strategies flattened."
    )


def _circuit_breaker(d: dict) -> str:
    return (
        f"🚨 CIRCUIT BREAKER tripped\n"
        f"{d.get('error_count','?')} consecutive errors on {d.get('broker','?')}\n"
        f"Trading halted. Cooling off {d.get('cooling_minutes',30)} min.\n"
        f"Check: algo.thetagainers.in"
    )


def _hourly_pnl(d: dict) -> str:
    lines = [f"📊 Hourly update · {d.get('time','')}"]
    for s in d.get("strategies", []):
        pnl = s.get("pnl", 0)
        sign = "+" if pnl >= 0 else ""
        lines.append(f"#{s['id']} {s['underlying']}: {sign}₹{pnl:,.0f}")
    lines.append(f"Total: {'+' if d.get('total_pnl',0)>=0 else ''}₹{d.get('total_pnl',0):,.0f}")
    return "\n".join(lines)


def _daily_summary(d: dict) -> str:
    pnl = d.get("net_pnl", 0)
    sign = "+" if pnl >= 0 else ""
    return (
        f"📊 Daily Summary · {d.get('date','')}\n"
        f"Trades: {d.get('total_trades',0)} ({d.get('closed',0)} closed, {d.get('live',0)} live)\n"
        f"Net P&L: {sign}₹{pnl:,.0f} ({sign}{d.get('return_pct',0):.2f}%)\n"
        f"Margin used: ₹{d.get('margin_used',0)/100000:.2f}L ({d.get('margin_pct',0):.0f}% of {d.get('capital','?')})\n"
        f"Best: {d.get('best_trade','—')}\n"
        f"Worst: {d.get('worst_trade','—')}\n"
        f"Next expiry: {d.get('next_expiry','—')}"
    )


def _session_expiring(d: dict) -> str:
    return (
        f"🔑 Broker session expiring soon\n"
        f"{d.get('broker','?')} · expires in {d.get('minutes','?')}m\n"
        f"Open: algo.thetagainers.in/connect-broker"
    )


_RENDERERS = {
    "TRADE_ENTERED":     _trade_entered,
    "POSITION_ENTERED":  _trade_entered,
    "STRATEGY_STARTED":  _trade_entered,
    "TRADE_EXITED":      _trade_exited,
    "TARGET_HIT":        _trade_exited,
    "TIME_EXIT":         _trade_exited,
    "MANUAL_EXIT":       _trade_exited,
    "MTM_DRAWDOWN":      _trade_exited,
    "SL_HIT":            _sl_hit,
    "KILL_SWITCH":       _kill_switch,
    "DEAD_MAN_SWITCH":   _dead_man,
    "CIRCUIT_BREAKER":   _circuit_breaker,
    "HOURLY_PNL":        _hourly_pnl,
    "DAILY_SUMMARY":     _daily_summary,
    "SESSION_EXPIRING":  _session_expiring,
}

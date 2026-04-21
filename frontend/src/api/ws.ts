/**
 * Strategy WebSocket client.
 *
 * Usage:
 *   const { events, connected } = useStrategyStream(strategyId);
 *
 * Auto-reconnects with exponential backoff. Emits every event received from
 * /strategy/{id}/stream into a sliding window buffer of 200 events.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/stores/auth";

export interface WSEvent {
  type: "hello" | "state_change" | "premium_tick" | "order_update" | "pnl_tick" | "log";
  data: any;
  ts: string;
}

export function useStrategyStream(strategyId: number | null) {
  const token = useAuth((s) => s.token);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!strategyId || !token) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      // Proxy through Vite dev / nginx prod. Note: WS uses separate proxy in vite.config.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const ws = new WebSocket(`${proto}://${host}/api/strategy/${strategyId}/stream?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); retryRef.current = 0; };
      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as WSEvent;
          setEvents((prev) => [...prev.slice(-199), evt]);
        } catch { /* skip */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          retryRef.current = Math.min(retryRef.current + 1, 6);
          const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
          setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => { cancelled = true; wsRef.current?.close(); };
  }, [strategyId, token]);

  return { events, connected };
}

# Go-Live Checklist

Before placing the first ₹ live order. Each item must be signed-off.

## 1. Paper trading — 4 expiries minimum
- [ ] Expiry 1 complete — verdict ✅ PASS
- [ ] Expiry 2 complete — verdict ✅ PASS
- [ ] Expiry 3 complete — verdict ✅ PASS
- [ ] Expiry 4 complete — verdict ✅ PASS
- [ ] Fill rate ≥ 99.5% across all 4
- [ ] Zero naked positions across all 4
- [ ] p95 tick-to-trade ≤ 200 ms (p99 ≤ 300 ms) across all 4

## 2. Load test
- [ ] `concurrent_strategies --users 10 --strategies-per-user 5 --duration 300` → ✅ PASS
- [ ] `rate_limit_stress` → no overshoot, no silent drops
- [ ] `failover` (mid-run broker disconnect) → recovery within 30s
- [ ] DB pool, Redis memory, CPU all < 70% peak during 10× load

## 3. External audit
- [ ] Audit firm engaged, scope document signed
- [ ] Code review findings addressed or risk-accepted in writing
- [ ] Penetration test complete, no CRITICAL/HIGH findings open
- [ ] Signed audit report filed

## 4. Compliance
- [ ] SEBI algo-ID assigned by broker, in env `SEBI_ALGO_ID`
- [ ] Algo-ID visible on at least one order in paper mode (verify in audit log)
- [ ] OTR cap tested at 100 threshold (simulated breach → halt observed)
- [ ] NSE/BSE freeze qty values verified against current exchange circular

## 5. Operations
- [ ] Runbook tested — two ops people can execute kill-switch via CLI under pressure
- [ ] On-call rotation set up (weekly, 2-person)
- [ ] Incident playbook rehearsed (kill-switch, circuit-breaker halt, rollback)
- [ ] Monitoring dashboards set up (Grafana) with alerts
- [ ] WhatsApp + Telegram + Email + SMS all tested with real numbers
- [ ] Daily backup verified (pg_dump to S3, test restore)

## 6. Security
- [ ] All secrets in AWS Secrets Manager (none in code, env files, or logs)
- [ ] IP allowlist configured for prod (home + office IPs)
- [ ] 2FA enforced for all users (confirm `totp_enabled=true` for every user in DB)
- [ ] Admin password rotated from seed default
- [ ] TLS cert valid, auto-renewing (Let's Encrypt)
- [ ] Bastion-only SSH access to prod; direct SSH disabled

## 7. Risk limits (verified live config)
- [ ] `MAX_LOTS_PER_STRATEGY=10` (start lower for first 2 weeks)
- [ ] `MAX_ACTIVE_STRATEGIES_PER_USER=5`
- [ ] `MAX_DAILY_LOSS_PER_USER=50000` (₹)
- [ ] `ORDERS_PER_SEC_PER_USER=8` (SEBI safe)
- [ ] `OTR_HALT_THRESHOLD=100`
- [ ] `DEAD_MAN_SWITCH_SECONDS=120`
- [ ] `MTM_DRAWDOWN_KILL_PCT=40`
- [ ] `HEDGE_LEGS_DEFAULT_ON=false`
- [ ] `TWO_PERSON_APPROVAL_MIN_LOTS=5`
- [ ] `APP_ENV=live` (flipped from `paper`)

## 8. First live week protocol
- [ ] 1-lot NIFTY only, no SENSEX
- [ ] No multi-strategy (one at a time)
- [ ] Admin monitoring UI continuously during market hours
- [ ] Daily P&L + audit review at 4 PM
- [ ] If ANY anomaly: pause, investigate, before resuming

---

**Sign-off:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Trader | Rohan | _________ | ___ |
| Admin | ______ | _________ | ___ |
| External Auditor | ______ | _________ | ___ |
| Risk Officer | ______ | _________ | ___ |

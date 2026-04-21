# External Audit Prep

**Audience**: Third-party reviewer (Associative, Trade Vectors, Toptal security, or similar) brought in before production go-live.

**Scope**: Verify the platform is safe for real money trading on Indian options markets (NIFTY + SENSEX) across multiple brokers.

---

## 1. What to review

### Critical paths (must pass)
1. **Order idempotency** — retry same `client_ref_id` → broker MUST return same order, not create a duplicate
2. **SEBI rate limit** — firm token bucket must not allow >10 orders/sec/user even under adversarial concurrency
3. **Freeze-qty slicing** — orders above NSE/BSE freeze are sliced; verify no broker rejection
4. **Partial-fill handling** — if CE fills but PE doesn't, system must either fill PE (retry) or flatten CE. Zero naked positions.
5. **Hash-chained audit log** — append-only; PG trigger blocks UPDATE/DELETE; hash recomputes correctly
6. **Kill switch** — hold-to-confirm + type-to-confirm; flattens all positions within 1 second
7. **Dead-man switch** — if UI heartbeat stale > N seconds, all positions auto-close
8. **Broker token encryption** — at rest (Fernet) + no secrets in logs/git

### Known limitations to flag in report
- Only 1 broker adapter wired in M3 (Zerodha). Others are stubs.
- Frontend mocks still present for some routes until M10 harness is run
- No multi-region failover (single AZ pair in ap-south-1)
- SEBI algo-registration paperwork is broker-side; we only tag orders

---

## 2. Code paths to inspect

| Area | File | What to check |
|------|------|---------------|
| SEBI rate limit | `app/common/rate_limit.py` | Lua script atomicity; verify burst behavior |
| Iceberg slicer | `app/common/slicer.py` | Jitter correctness; no off-by-one |
| OMS | `app/execution/order_manager.py` | Partial fill handling, basket gather semantics |
| Idempotency | `app/execution/idempotency.py` | Hash chain deterministic; retried orders match |
| Peg/requote | `app/execution/requote.py` | Never converts LIMIT to MARKET; slippage cap enforced |
| Pre-trade RMS | `app/risk/pretrade.py` | All 9 checks execute; order matters (cheap first) |
| Runtime RMS | `app/risk/runtime.py` | All 10 triggers tested; no silent exit paths |
| Audit | `app/audit/service.py` | Hash chain integrity; in-memory cache correctness |
| Notify | `app/notify/service.py` | Severity → channel routing; retry bounded |
| Broker token crypto | `app/auth/security.py` | Fernet key derivation from SECRET_KEY |

---

## 3. Tests to re-run

```bash
cd backend
uv run pytest tests/ -v --cov=app --cov-fail-under=80
uv run python -m tests.load.concurrent_strategies --users 10 --strategies-per-user 5 --duration 300
uv run python -m tests.load.rate_limit_stress
uv run python -m tests.paper.harness
```

Expected: all green, coverage ≥80%, paper harness verdict ✅ PASS.

---

## 4. Security checklist

- [ ] Secrets in env/Secrets Manager only (never in code, never in logs)
- [ ] JWT with short expiry + refresh rotation
- [ ] 2FA mandatory (TOTP, RFC 6238, ±1 step tolerance)
- [ ] IP allowlist enforced
- [ ] Failed login exponential lockout (5 → 15m → 30m → ... → 24h)
- [ ] Broker tokens encrypted at rest (Fernet, key derived from SECRET_KEY)
- [ ] Audit log immutable (PG triggers blocking UPDATE/DELETE)
- [ ] No PII in logs (bcrypt hashes never leaked)
- [ ] CORS restricted to known origins
- [ ] CSRF protection on state-changing endpoints (or strict same-origin)
- [ ] SQL injection: only parameterized queries (SQLAlchemy + text bindings)
- [ ] Rate limiting on login endpoint (brute force)
- [ ] Dependencies scanned (`pip-audit` / Dependabot)

---

## 5. Questions for reviewer

1. Any SEBI algo registration step we've missed?
2. Is the hash-chain design sufficient for legal audit, or do we need WORM storage?
3. Should we require two-person approval on >Y lots instead of 5?
4. Is Fernet (AES-128 CBC + HMAC-SHA256) sufficient for broker token encryption, or should we use AWS KMS envelope encryption?
5. Recommended disaster-recovery RPO/RTO for a ₹ algo platform?
6. Any additional SEBI/NSE compliance we should bake in?

---

## 6. Go-live gate

All of these must be ticked before first live lot:

- [ ] 4+ consecutive expiries of paper trading, verdict ✅ PASS
- [ ] Zero naked positions across all paper runs
- [ ] p99 tick-to-trade < 300ms under 50-concurrent-strategy load
- [ ] External audit report addressed (every finding either fixed or risk-accepted in writing)
- [ ] Runbook tested (ops can restart, roll back, halt via written procedure)
- [ ] On-call rotation defined
- [ ] Incident playbook rehearsed (kill switch, circuit breaker halt)
- [ ] First live week restricted to 1-lot NIFTY only

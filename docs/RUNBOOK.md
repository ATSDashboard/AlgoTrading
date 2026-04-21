# Operator Runbook

Procedures for starting, stopping, rolling back, and handling incidents.

---

## 🟢 Daily operations

### Morning startup (08:30 IST, 1 hour before market open)

```bash
# 1. Verify services
curl https://algo.thetagainers.in/health/readyz
# Expected: {"status": "ready", "brokers": {"paper": true, "zerodha": true, ...}}

# 2. Check audit chain integrity (should be fast)
ssh prod-api
cd /srv/algo/backend && uv run python -m app.audit.verify_chain --last 1000
# Expected: ✅ chain intact, N entries checked

# 3. Broker session health — log into UI, Settings → Brokers & Demats
#    All should show ● Active with < 1h token expiry for brokers requiring daily refresh

# 4. Risk state fresh for today — Admin → Risk Console
#    Daily counters reset at 00:00 IST automatically
```

### During market hours

- Dashboard = single source of truth
- Top bar shows SEBI rate usage; if it ever hits cap, investigate before next entry
- Circuit breaker status (green/yellow/red) = watch this
- Broker latency in top bar — >100ms sustained means investigate

### EOD (16:00 IST)

```bash
# Reconciliation runs automatically at 16:00
# Verify in Admin → EOD Reports

# Trigger manual recon if needed:
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  https://algo.thetagainers.in/admin/reconcile/today
```

---

## 🔴 Incident response

### Kill switch (emergency halt ALL)

**UI**: Admin → Global Kill Switch → type `HALT ALL` → 2nd admin approves.

**CLI** (if UI is down):
```bash
ssh prod-api
cd /srv/algo/backend
uv run python -m app.admin.kill_all --reason "UI down"
```

Effect: All LIVE strategies transition to `EXITING`, OMS flattens all positions at LIMIT prices with 1% slippage cap. Takes 10-60 seconds depending on leg count.

### Broker outage (one broker down)

1. Per-broker circuit breaker trips automatically after 3 consecutive errors
2. Strategies using that broker halt; others unaffected
3. Check `/health/readyz` — shows which broker is down
4. Alert the broker's support if outage persists >5 min
5. When broker recovers, manually re-enable in Admin → Broker Health

### All brokers down (market-wide event)

1. Global circuit breaker trips, halting all new strategies
2. Existing positions cannot be flattened until brokers recover
3. Monitor positions via broker app / web terminal as backup
4. Document the outage window in incident log for post-mortem

### Database down

1. FastAPI health returns 503
2. Running strategies continue via in-memory state (engines hold last-known positions)
3. NEW strategies cannot be created (schema reads fail)
4. Restart DB, verify audit chain integrity before resuming

### Runtime RMS loop crash

1. Supervisor restarts the worker process; state re-hydrates from DB
2. Any LIVE strategy resumes its risk loop within 10s
3. If strategy was mid-entry when crashed, state is `ENTERING` — admin must resolve (either `EXITING` with manual close or resume if orders went through)

---

## 🛠 Deployments

### Standard release (zero-downtime, no open positions)

```bash
# 1. On laptop, push to main
git push origin main

# 2. GitHub Actions runs: lint → test → build Docker images → push to ECR

# 3. SSH to prod, pull new images
ssh prod-api
cd /srv/algo
IMAGE_TAG=$(git rev-parse --short HEAD) docker compose pull
docker compose up -d

# 4. Verify
curl https://algo.thetagainers.in/health/readyz
curl https://algo.thetagainers.in/  # should show new version
```

### Release during market hours (open positions exist)

**Prefer to avoid.** If necessary:

1. Verify all LIVE strategies are idempotent to restart (engine re-hydrates from DB)
2. Deploy with `docker compose up -d --no-deps api` (api only, workers keep running)
3. Watch logs for errors
4. If anything looks off → rollback immediately (see below)

### Rollback (< 2 min)

```bash
ssh prod-api
cd /srv/algo
IMAGE_TAG=$PREVIOUS_SHA docker compose up -d
# Confirm /health/readyz is green
```

`PREVIOUS_SHA` is in `/srv/algo/.last-known-good` (updated by CD on successful deploys).

---

## 📊 Monitoring

| Signal | Where | Alert threshold |
|--------|-------|----------------|
| p99 tick-to-trade latency | CloudWatch `theta-gainers-metrics` | >300ms for 5 min |
| Order rejection rate | CloudWatch | >2% over rolling 10 min |
| Broker API error rate | Sentry + CloudWatch | >5 errors/min on any broker |
| DB connection pool usage | CloudWatch RDS | >80% sustained |
| Redis memory | CloudWatch ElastiCache | >80% |
| Daily loss approaching cap | Runtime alert via WhatsApp | 80% of daily cap |
| Strategy count | Dashboard | > `MAX_ACTIVE_STRATEGIES_GLOBAL` |

---

## 🔑 Credentials & access

- `~/.aws/credentials` — AWS IAM user with `ThetaGainersOps` policy
- SSH via bastion only; direct SSH to prod-api disabled
- AWS Secrets Manager: `theta-gainers/prod/*` for all broker keys + JWT secrets
- DB direct access via `psql` through bastion; read-only for diagnostics
- Grafana at `https://metrics.thetagainers.in` — read-only for traders, edit for admins

---

## 🆘 Escalation

1. **Operator** (you) — first responder, can kill switch, restart, rollback
2. **Admin** (Rohan) — approves 2-person actions, investigates edge cases
3. **Dev team** — bugs, code changes, new adapters
4. **Broker support** — Axis, Zerodha, Monarch, JM each have escalation numbers in Admin → Contacts
5. **SEBI compliance** — only via broker; never direct

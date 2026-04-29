# Team Review Guide

This is a 30-minute review pass for anyone reading the Theta Gainers
Algo repo for the first time. Follow it in order.

---

## 0. Set up

```bash
git clone https://github.com/ATSDashboard/AlgoTrading.git
cd AlgoTrading
git log --oneline -20         # last 20 commits — context for recent work
```

You don't need to run anything to do this review. Reading is enough.

---

## 1. Read these 3 docs (15 min)

In order:

| # | File | Time | Why |
|---|---|---|---|
| 1 | [`HANDOFF.md`](./HANDOFF.md) | 12 min | The whole product + audit + extension guide |
| 2 | [`README.md`](./README.md) | 2 min | Architecture diagram + stack |
| 3 | [`../DEVELOPER_ASSIGNMENT.md`](../DEVELOPER_ASSIGNMENT.md) | 1 min | Original 1-page brief |

After this you should be able to answer:
- What does the Default Strategy do, and why is it the recommended path?
- What are the 4 premium trigger modes and when do you use each?
- How does multi-broker SOR + per-demat allocation interact?
- Why is the dead-man switch hidden in Advanced and not on by default?

---

## 2. Read these 6 code files (10 min)

In order:

| # | File | Why read |
|---|---|---|
| 1 | `backend/app/main.py` | All registered routes in 90 lines |
| 2 | `backend/app/brokers/base.py` | Adapter contract — every broker honours this |
| 3 | `frontend/src/pages/NewStrategy.tsx` | The Trade page (orchestration only — 708 lines) |
| 4 | `frontend/src/components/trade/PremiumTrigger.tsx` | Most complex of the new sub-components |
| 5 | `frontend/src/components/trade/BrokerDematPicker.tsx` | Multi-broker SOR + allocation row |
| 6 | `backend/app/strike_selector/filters.py` | The 13 composable strike filters |

---

## 3. Spot-check (5 min)

Open the file map in HANDOFF §3.2 and verify against `ls`:

```bash
ls backend/app/                       # 12 modules
ls frontend/src/pages/                # 11 pages, no empty dirs
ls frontend/src/components/trade/     # 9 sub-components after refactor
```

Then run these stats commands:

```bash
# Frontend size sanity
find frontend/src -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -rn | head -10

# Backend size sanity
find backend/app -name "*.py" | xargs wc -l | sort -rn | head -10
```

NewStrategy.tsx should be ~708 lines, no other frontend file > 600 lines.
Backend files should be balanced; nothing > 350 lines.

---

## 4. What to flag

When you write up your review, flag in this order of importance:

1. **Critical bugs** — anything that could place a wrong order, lose money,
   or break SEBI compliance. Tag with `[CRITICAL]`.
2. **Architectural concerns** — file does too much, contract leaks, broken
   abstractions. Tag with `[ARCH]`.
3. **Security** — auth, secrets, RBAC, audit chain. Tag with `[SEC]`.
4. **Correctness** — logic looks suspicious, edge cases missing. Tag with
   `[BUG]`.
5. **Maintainability** — naming, dead code, missing types. Tag with `[MAINT]`.
6. **Style / polish** — tabs vs spaces, import order. Tag with `[STYLE]`.

**Don't:**
- Recommend a rebuild from scratch — see HANDOFF §10. The hard parts
  (broker adapters, audit chain, iceberg, RMS loop) work; rebuilding
  burns 6–8 weeks for the same product.
- Suggest changing the broker adapter interface without proposing
  changes to all 3 implementations (paper, zerodha, base).
- Flag the in-memory mocks (broker demats, margin numbers, permissions)
  as "must fix now" — they're documented Phase-2 stubs with stable
  API contracts. They'll swap to live data without UI changes.

**Do:**
- Push back on anything that's tightly coupled or hard to test.
- Suggest refactors with concrete file paths + line numbers.
- Highlight tests that should exist but don't.
- Note SEBI / NSE / BSE rules that may have moved since the last
  product spec update.

---

## 5. Open questions for the product owner

These are tracked in HANDOFF §11. If you have a strong opinion on any of
them, add it to your review:

1. Should the Default Strategy CTA also be on `/strategy/new` or only `/trade`?
2. Multi-broker SOR — broker session goes dark mid-execution: cancel & re-route, or pause?
3. Premium trigger "Per ₹1Cr" — margin denominator: current required, or projected at fill?
4. Entry time window — apply to trigger evaluation only, or also force-exit positions outside the window?
5. Margin allocation cushion — released to "free" pool when position closes, or stay reserved for next strategy?

---

## 6. Submit your review

Open a GitHub Discussion or Issue on
https://github.com/ATSDashboard/AlgoTrading
with the tag `code-review`. Include:
- Your name + role
- Time spent
- Findings grouped by tag (`[CRITICAL]`, `[ARCH]`, etc.)
- Specific file paths and line numbers
- Concrete suggested fixes (don't just point — propose)

Or email Rohan directly: `rohan@navingroup.in`.

Thank you for reviewing.

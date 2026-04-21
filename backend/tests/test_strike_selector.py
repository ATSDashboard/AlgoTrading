"""Strike selector engine tests — filters + combinators + end-to-end evaluation."""
from app.strike_selector.filters import MarketCtx, StrikeRow, REGISTRY
from app.strike_selector.engine import evaluate_rule, evaluate_chain


def _strike(k=25000, opt="CE", ltp=10, oi=1_000_000, **kw):
    defaults = dict(bid=ltp-0.5, ask=ltp+0.5, oi_change_pct=30, volume=500, iv=16.5)
    defaults.update(kw)
    return StrikeRow(strike=k, option_type=opt, ltp=ltp, oi=oi, **defaults)


def _market(**kw):
    defaults = dict(spot=24800, futures=24825, vix=13.24, vix_change_pct=0,
                    oi_pcr=1.1, vol_pcr=1.0, max_pain=24800, dte=3,
                    expected_move=180, ivr_percentile=45)
    defaults.update(kw)
    return MarketCtx(**defaults)


def test_distance_points_filter():
    s = _strike(k=25400)
    m = _market(spot=24800)
    rule = {"filter": "DISTANCE_POINTS", "params": {"min": 500}}
    log = []
    assert evaluate_rule(rule, s, m, log) is True      # 600 ≥ 500
    assert log[0].passed

    rule2 = {"filter": "DISTANCE_POINTS", "params": {"min": 1000}}
    log2 = []
    assert evaluate_rule(rule2, s, m, log2) is False   # 600 < 1000
    assert not log2[0].passed


def test_all_of_combinator():
    s = _strike(k=25500, ltp=9.95, oi=2_094_000)
    m = _market(spot=24800)
    rule = {"all_of": [
        {"filter": "DISTANCE_POINTS",  "params": {"min": 500}},
        {"filter": "PREMIUM_PER_LEG",  "params": {"min": 0.8}},
        {"filter": "OI_MIN",           "params": {"min": 1_000_000}},
    ]}
    log = []
    assert evaluate_rule(rule, s, m, log) is True
    assert all(r.passed for r in log)


def test_any_of_and_not_combinators():
    s = _strike(k=25500, ltp=9.95, oi=2_094_000)
    m = _market(spot=24800)
    rule = {"any_of": [
        {"filter": "DISTANCE_POINTS", "params": {"min": 2000}},   # fails (only 700)
        {"filter": "OI_MIN", "params": {"min": 1_000_000}},       # passes
    ]}
    assert evaluate_rule(rule, s, m, []) is True

    rule_not = {"not": {"filter": "DISTANCE_POINTS", "params": {"min": 2000}}}
    assert evaluate_rule(rule_not, s, m, []) is True


def test_evaluate_chain_ranks_passers_first():
    m = _market()
    chain = [
        _strike(k=24900, opt="CE", ltp=60),    # too close
        _strike(k=25500, opt="CE", ltp=9.95, oi=2_094_000),  # good
        _strike(k=25300, opt="CE", ltp=25, oi=1_500_000),    # closer
    ]
    rule = {"all_of": [
        {"filter": "DISTANCE_POINTS", "params": {"min": 500}},
        {"filter": "PREMIUM_PER_LEG", "params": {"min": 0.8}},
    ]}
    result = evaluate_chain(chain, m, rule, target_side="CE")
    # First candidate in the result must be a passing one
    assert result[0].passed
    assert result[0].strike.strike in (25500, 25300)


def test_user_example_rule():
    """The user's 'min 3% away AND combined ≥ 5000/Cr AND each leg ≥ ₹0.8'."""
    s = _strike(k=25500, opt="CE", ltp=9.95, oi=2_000_000)
    m = _market(spot=24800)
    # 25500 vs spot 24800 = 700 pts = 2.82% → fails 3% test
    rule = {"all_of": [
        {"filter": "DISTANCE_PERCENT", "params": {"min": 3}},
        {"filter": "PREMIUM_PER_LEG",  "params": {"min": 0.8}},
    ]}
    assert evaluate_rule(rule, s, m, []) is False

    # Now test deeper strike 25800 = 1000 pts = 4.03% → passes
    s2 = _strike(k=25800, opt="CE", ltp=5.5, oi=1_500_000)
    assert evaluate_rule(rule, s2, m, []) is True


def test_filter_registry_complete():
    """All 16 filters registered."""
    expected = {
        "DISTANCE_POINTS", "DISTANCE_PERCENT", "DELTA", "PREMIUM_PER_LEG",
        "COMBINED_PREMIUM", "PREMIUM_PER_CR_MARGIN", "OI_MIN", "OI_WALL_BEHIND",
        "BID_ASK_SPREAD_PCT", "MIN_VOLUME", "IV_RANK", "DAYS_TO_EXPIRY",
        "CUSHION_RATIO", "PCR_REGIME", "VIX_REGIME", "TIME_WINDOW",
    }
    assert set(REGISTRY.keys()) == expected


def test_pcr_regime_gate():
    s = _strike(k=25500, opt="CE", ltp=10)
    # PCR 1.4 = bullish
    m_bull = _market(oi_pcr=1.4)
    rule_allow_bull = {"filter": "PCR_REGIME", "params": {"allow": ["bullish"]}}
    rule_allow_neutral = {"filter": "PCR_REGIME", "params": {"allow": ["neutral"]}}
    assert evaluate_rule(rule_allow_bull, s, m_bull, []) is True
    assert evaluate_rule(rule_allow_neutral, s, m_bull, []) is False

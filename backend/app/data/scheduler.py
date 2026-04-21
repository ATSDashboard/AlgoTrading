"""APScheduler — daily jobs: security master sync (08:30 IST), EOD recon (16:00 IST).

Also: broker-token refresh background task (Axis: every 13 min; others per-adapter).
"""
from __future__ import annotations

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.data.security_master import sync_all_brokers

log = structlog.get_logger(__name__)


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

    # Daily security master sync before market open
    scheduler.add_job(
        sync_all_brokers,
        CronTrigger(hour=8, minute=30),
        id="security_master_daily",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # EOD reconciliation placeholder — M7
    # scheduler.add_job(run_eod_recon, CronTrigger(hour=16, minute=0), ...)

    return scheduler

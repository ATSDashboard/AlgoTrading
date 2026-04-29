"""FastAPI entrypoint — mounts all routers, middleware, startup/shutdown."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.brokers.registry import list_brokers
from app.config import get_settings

from app.auth.routes import router as auth_router
from app.brokers.routes import router as broker_router
from app.data.routes import router as data_router
from app.data.scheduler import build_scheduler
from app.health.routes import router as health_router
from app.strategy.routes import router as strategy_router
from app.strike_selector.routes import router as strike_selector_router
from app.analytics.routes import router as analytics_router
from app.admin.routes import router as admin_router

settings = get_settings()


def _configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
        ),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
    _configure_logging()
    log = structlog.get_logger()
    log.info("startup", env=settings.app_env, version=settings.app_version,
             brokers=[b.value for b in list_brokers()])
    scheduler = build_scheduler()
    scheduler.start()
    app.state.scheduler = scheduler
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        log.info("shutdown")


app = FastAPI(
    title="Theta Gainers Algo",
    version=settings.app_version,
    lifespan=lifespan,
    default_response_class=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(broker_router, prefix="/broker", tags=["broker"])
app.include_router(data_router, prefix="/data", tags=["data"])
app.include_router(strategy_router, prefix="/strategy", tags=["strategy"])
app.include_router(strike_selector_router, prefix="/strike-selector", tags=["strike-selector"])
app.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "theta-gainers", "env": settings.app_env,
            "version": settings.app_version}

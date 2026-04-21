"""Alembic env — uses sync psycopg driver (asyncpg can't run multi-statement SQL blocks).

The app itself uses asyncpg at runtime for high-throughput async queries;
migrations are an operator task and run fine with the sync driver.
"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.config import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Swap asyncpg → psycopg for migrations
_url = get_settings().database_url.replace("+asyncpg", "+psycopg")
config.set_main_option("sqlalchemy.url", _url)

target_metadata = None


def run_migrations_offline() -> None:
    context.configure(url=_url, target_metadata=target_metadata,
                      literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

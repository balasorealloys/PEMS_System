"""SQLAlchemy engine and session management.

PEMS runs on a single PostgreSQL database. The ``pems`` schema holds the pems_* tables
and the synced raw meter data; the corporate ``balcorpdb`` and ``sap_odata_api`` schemas
(consolidated into the same Postgres) hold intranet SSO login, sessions, page-views and
the employee directory. Everything uses ``get_db`` / ``SessionLocal``.

The legacy MySQL auth engine has been retired — ``get_auth_db`` / ``AuthSessionLocal``
remain as aliases of the primary Postgres session for backward compatibility.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# On Postgres, pin the search_path to the pems schema so unqualified table names
# (pems_*, em_valuedata_*) resolve without a schema prefix in every query.
_pg = settings.db_dialect.startswith("postgresql")
_connect_args = {"options": f"-c search_path={settings.db_schema}"} if _pg else {}

engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,   # recover from dropped connections (long-lived service)
    pool_recycle=3600,
    future=True,
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

# The intranet auth tables (login, sessions, page-views, employee directory) now live
# in the same Postgres database under the balcorpdb / sap_odata_api schemas, so the old
# separate MySQL engine is gone. These aliases keep any legacy references pointing at
# the primary Postgres session.
AuthSessionLocal = SessionLocal


class Base(DeclarativeBase):
    """Base class for PEMS-owned ORM models (pems_* tables)."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a primary (Postgres) session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Legacy alias — auth now shares the primary Postgres engine.
get_auth_db = get_db

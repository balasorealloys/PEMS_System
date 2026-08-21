"""SQLAlchemy engines and session management.

PEMS uses two databases:
  * primary  — PostgreSQL (corpappdb, schema "pems"): all pems_* tables + the synced
    raw meter data. Use ``get_db`` / ``SessionLocal``.
  * auth     — MySQL (balcorpdb): intranet SSO login, sessions, page-views. Use
    ``get_auth_db`` / ``AuthSessionLocal``.

Keeping both connections defined in exactly one place is what lets the dialect be
swapped via configuration (the MySQL→Postgres move was a config change, not a
rewrite of the connection layer).
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

# Auth database (MySQL) — separate engine; intranet login/session/page-view tables.
auth_engine = create_engine(
    settings.auth_sqlalchemy_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)
AuthSessionLocal = sessionmaker(bind=auth_engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for PEMS-owned ORM models (pems_* tables)."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a primary (Postgres) session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_auth_db() -> Iterator[Session]:
    """FastAPI dependency yielding an auth (MySQL / balcorpdb) session."""
    db = AuthSessionLocal()
    try:
        yield db
    finally:
        db.close()

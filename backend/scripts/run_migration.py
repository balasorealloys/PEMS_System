"""Apply a SQL migration file against the configured database.

Usage:
    python -m scripts.run_migration                     # applies all db/migrations/*.sql
    python -m scripts.run_migration 001_pems_core.sql   # applies one file

Idempotent: migrations use CREATE TABLE IF NOT EXISTS. A future project will likely
move to Alembic; this keeps the early setup reproducible and in version control.
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

from app.db import engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "db" / "migrations"


def split_statements(sql: str) -> list[str]:
    # Strip '--' line comments first (they may contain semicolons), then split on ';'.
    lines = []
    for line in sql.splitlines():
        idx = line.find("--")
        if idx != -1:
            line = line[:idx]
        lines.append(line)
    cleaned = "\n".join(lines)
    return [s.strip() for s in cleaned.split(";") if s.strip()]


def apply_file(path: Path) -> None:
    print(f"\n>>> applying {path.name}")
    statements = split_statements(path.read_text(encoding="utf-8"))
    with engine.begin() as conn:
        for stmt in statements:
            first_line = stmt.splitlines()[0][:70]
            print(f"    {first_line} ...")
            conn.execute(text(stmt))
    print(f"<<< done ({len(statements)} statements)")


def main() -> None:
    if len(sys.argv) > 1:
        files = [MIGRATIONS_DIR / sys.argv[1]]
    else:
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("no migration files found")
        return
    for f in files:
        if not f.exists():
            print(f"missing: {f}")
            sys.exit(1)
        apply_file(f)


if __name__ == "__main__":
    main()

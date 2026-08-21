"""Apply a .sql migration file against the configured PEMS database.

Runs each ``;``-separated statement in one transaction using the app's own
engine (so it reads the same ``.env`` the app does). Handy for applying a new
``db/migrations/NNN_*.sql`` on a server without a separate MySQL client.

    cd backend
    python scripts/run_sql.py ../db/migrations/012_meter_factor_cleanup.sql
"""
from __future__ import annotations

import pathlib
import sys

# allow running from the backend/ dir (so `import app` resolves)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import text          # noqa: E402
from app.db import engine            # noqa: E402


def run(path: str) -> None:
    raw = pathlib.Path(path).read_text(encoding="utf-8")
    # strip full-line -- comments first, so a ';' inside a comment can't split a statement
    code = "\n".join(l for l in raw.splitlines() if not l.strip().startswith("--"))
    stmts = [s.strip() for s in code.split(";") if s.strip()]
    applied = 0
    with engine.begin() as cx:
        for body in stmts:
            result = cx.execute(text(body))
            applied += 1
            print(f"  OK ({result.rowcount if result.rowcount != -1 else '?'} rows): {body.splitlines()[0][:72]}")
    print(f"Applied {applied} statement(s) from {pathlib.Path(path).name}.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python scripts/run_sql.py <path-to.sql>")
        sys.exit(2)
    run(sys.argv[1])

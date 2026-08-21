"""One-time data copy: PEMS application tables from MySQL (balmpicc) -> Postgres (pems).

Copies every pems_* table's rows into the already-created Postgres schema. The raw
meter table (em_valuedata_*) is NOT copied — it is synced externally and already
present in Postgres. Auth tables (balcorpdb.*) stay in MySQL and are not touched.

Idempotent: rows that already exist (by primary/unique key) are skipped
(ON CONFLICT DO NOTHING), so it is safe to re-run.

Usage (from backend/):
    # source = the OLD MySQL that currently holds pems_* (balmpicc)
    export SRC_DB_URL='mysql+pymysql://user:pass@mysql-host:3306/balmpicc'
    # target = the Postgres in .env (DB_* / DB_SCHEMA) — used automatically
    python scripts/migrate_mysql_to_pg.py
"""
from __future__ import annotations

import json
import os
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, inspect, text  # noqa: E402
from sqlalchemy.types import Boolean                  # noqa: E402

from app.db import engine as pg_engine                # noqa: E402  (target: primary/Postgres)
from app.config import get_settings                   # noqa: E402

settings = get_settings()
SCHEMA = settings.db_schema

# FK-safe order: parents before children.
# NOTE: derived/cache tables are NOT copied — they are regenerated in Postgres:
#   pems_meter_15min / pems_rollup_state  → scripts/backfill_15min.py
#   pems_meter_snapshot / pems_daily_consumption / pems_energy_balance → recomputed on demand
TABLES = [
    "pems_cost_center", "pems_meter", "pems_load", "pems_load_feeder_map",
    "pems_tariff", "pems_config", "pems_sap_posting", "pems_bill_actual", "pems_bill_recon",
    "pems_audit_log", "pems_constant", "pems_audit", "pems_meter_factor", "pems_user_role",
]
# id-bearing tables whose identity sequence must be bumped past the copied ids.
ID_TABLES = [
    "pems_cost_center", "pems_load", "pems_load_feeder_map", "pems_tariff",
    "pems_meter_snapshot", "pems_daily_consumption", "pems_energy_balance",
    "pems_sap_posting", "pems_bill_actual", "pems_bill_recon", "pems_audit_log",
    "pems_constant", "pems_audit",
]


def _pg_column_meta(insp, table: str) -> dict[str, dict]:
    return {c["name"]: c for c in insp.get_columns(table, schema=SCHEMA)}


def _is_json(coltype) -> bool:
    return "JSON" in str(coltype).upper()


def copy_table(src, insp, table: str) -> tuple[int, int]:
    meta = _pg_column_meta(insp, table)
    if not meta:
        print(f"  x {table}: not found in Postgres schema, skipping")
        return (0, 0)
    cols = list(meta.keys())
    bool_cols = {n for n, m in meta.items() if isinstance(m["type"], Boolean)}
    json_cols = {n for n in cols if _is_json(meta[n]["type"])}

    src_rows = src.execute(text(f"SELECT {', '.join(cols)} FROM {table}")).mappings().all()
    if not src_rows:
        print(f"  - {table}: 0 rows")
        return (0, 0)

    placeholders = ", ".join(f"CAST(:{c} AS JSONB)" if c in json_cols else f":{c}" for c in cols)
    insert_sql = text(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING")

    payload = []
    for r in src_rows:
        row = dict(r)
        for c in bool_cols:
            if row.get(c) is not None:
                row[c] = bool(row[c])
        for c in json_cols:
            v = row.get(c)
            if v is not None and not isinstance(v, str):
                row[c] = json.dumps(v)              # normalise dict/list -> JSON text
        payload.append(row)
    with pg_engine.begin() as pg:                   # one batched executemany per table
        pg.execute(insert_sql, payload)
    print(f"  [ok] {table}: {len(payload)} source rows processed")
    return (len(src_rows), len(payload))


def reset_sequences() -> None:
    with pg_engine.begin() as pg:
        for t in ID_TABLES:
            pg.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{SCHEMA}.{t}', 'id'), "
                f"GREATEST(COALESCE((SELECT MAX(id) FROM {t}), 1), 1))"))
    print("  [ok] identity sequences reset")


def main() -> None:
    src_url = os.environ.get("SRC_DB_URL")
    if not src_url:
        print("ERROR: set SRC_DB_URL to the source MySQL DSN (.../balmpicc).")
        sys.exit(2)
    src_engine = create_engine(src_url, future=True)
    insp = inspect(pg_engine)
    print(f"Copying pems_* -> Postgres schema '{SCHEMA}' ...")
    total = 0
    with src_engine.connect() as src:
        for t in TABLES:
            _, done = copy_table(src, insp, t)
            total += done
    reset_sequences()
    print(f"Done. {total} rows processed across {len(TABLES)} tables.")


if __name__ == "__main__":
    main()

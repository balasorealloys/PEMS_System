"""Incremental refresh of the pems_meter_15min rollup (used by a scheduler)."""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import text

from app.config import get_settings
from app.db import engine

settings = get_settings()
VD = f"em_valuedata_{settings.client_id.lower()}"
# Floor each reading to its 15-minute block. Postgres date_bin aligns to the origin
# (a :00/:15/:30/:45 boundary), replacing MySQL's DATE_ADD/FLOOR(MINUTE()/15) trick.
_BLK = "date_bin(INTERVAL '15 minutes', datetimestamp, TIMESTAMP '2000-01-01')"
# Never let a single refresh run unbounded — if it hangs it would wedge the caller
# (APScheduler with max_instances=1) and the rollup would silently go stale.
_STATEMENT_TIMEOUT_MS = 300_000   # 5 minutes


def refresh_incremental() -> dict:
    """Roll up only blocks at/after the last processed block (re-does the last partial).

    Fully self-contained and exception-safe: any failure is caught and returned (and
    printed) rather than propagated, so a bad run can never stop future runs. A
    per-statement timeout guards against a hung query holding the scheduler slot.
    """
    try:
        with engine.begin() as conn:
            if settings.db_dialect.startswith("postgresql"):
                conn.execute(text(f"SET LOCAL statement_timeout = {_STATEMENT_TIMEOUT_MS}"))
            last = conn.execute(text(
                "SELECT last_block FROM pems_rollup_state WHERE rollup_key='meter_15min'")).scalar()
            dmax = conn.execute(text(f"SELECT MAX(datetimestamp) FROM {VD}")).scalar()
            if dmax is None:
                return {"ok": False, "reason": "no source data"}
            start = (last - timedelta(minutes=15)) if last else dmax - timedelta(days=2)
            n = conn.execute(text(f"""
                INSERT INTO pems_meter_15min
                      (device_id, feeder_id, block_start, avg_kw, avg_kva, max_kw, max_kva, kwh, kvah, samples)
                SELECT deviceid, feederid, {_BLK} AS blk,
                       AVG(kw), AVG(kva), MAX(kw), MAX(kva), MAX(kwh), MAX(kvah), COUNT(*)
                FROM   {VD}
                WHERE  datetimestamp >= :s
                GROUP  BY deviceid, feederid, blk
                ON CONFLICT (device_id, feeder_id, block_start) DO UPDATE SET
                       avg_kw=EXCLUDED.avg_kw, avg_kva=EXCLUDED.avg_kva,
                       max_kw=EXCLUDED.max_kw, max_kva=EXCLUDED.max_kva,
                       kwh=EXCLUDED.kwh, kvah=EXCLUDED.kvah, samples=EXCLUDED.samples
            """), {"s": start}).rowcount
            conn.execute(text(
                "INSERT INTO pems_rollup_state (rollup_key, last_block) VALUES ('meter_15min', :b) "
                "ON CONFLICT (rollup_key) DO UPDATE SET last_block=EXCLUDED.last_block"), {"b": dmax})
        print(f"[rollup] {datetime.now():%Y-%m-%d %H:%M:%S} ok — {n} blocks, through {dmax}", flush=True)
        return {"ok": True, "affected": n, "through": dmax.isoformat()}
    except Exception as e:  # noqa: BLE001 — never let a refresh failure stop the scheduler
        print(f"[rollup] {datetime.now():%Y-%m-%d %H:%M:%S} FAILED: {type(e).__name__}: {str(e)[:200]}", flush=True)
        return {"ok": False, "error": str(e)[:300]}


# Standalone runner for the dedicated rollup worker container (docker-compose `rollup`
# service): `python -m app.services.rollup --loop` refreshes every 15 minutes forever.
# This keeps the rollup fresh independently of the API process's in-app scheduler.
if __name__ == "__main__":
    import sys
    import time

    interval = 900  # 15 minutes
    loop = "--loop" in sys.argv
    print(f"[rollup] worker starting (loop={loop}, interval={interval}s)", flush=True)
    while True:
        refresh_incremental()
        if not loop:
            break
        time.sleep(interval)

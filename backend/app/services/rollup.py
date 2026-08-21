"""Incremental refresh of the pems_meter_15min rollup (used by a scheduler)."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import text

from app.config import get_settings
from app.db import engine

settings = get_settings()
VD = f"em_valuedata_{settings.client_id.lower()}"
# Floor each reading to its 15-minute block. Postgres date_bin aligns to the origin
# (a :00/:15/:30/:45 boundary), replacing MySQL's DATE_ADD/FLOOR(MINUTE()/15) trick.
_BLK = "date_bin(INTERVAL '15 minutes', datetimestamp, TIMESTAMP '2000-01-01')"


def refresh_incremental() -> dict:
    """Roll up only blocks at/after the last processed block (re-does the last partial)."""
    with engine.begin() as conn:
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
        return {"ok": True, "affected": n, "through": dmax.isoformat()}

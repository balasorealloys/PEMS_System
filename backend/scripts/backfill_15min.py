"""Backfill / refresh the pems_meter_15min rollup from em_valuedata_*.

Server-side INSERT..SELECT aggregation, one calendar month per statement (re-runnable;
ON DUPLICATE KEY updates existing blocks). Also advances pems_rollup_state.

Run:  python -m scripts.backfill_15min                # full history
      python -m scripts.backfill_15min 2026-06        # a single month (YYYY-MM)
      python -m scripts.backfill_15min --incremental   # only blocks newer than last run
"""
from __future__ import annotations

import sys
from calendar import monthrange
from datetime import datetime, timedelta

from sqlalchemy import text

from app.config import get_settings
from app.db import engine

settings = get_settings()
VD = f"em_valuedata_{settings.client_id.lower()}"
BLK = "date_bin(INTERVAL '15 minutes', datetimestamp, TIMESTAMP '2000-01-01')"

INSERT_SQL = text(f"""
INSERT INTO pems_meter_15min
      (device_id, feeder_id, block_start, avg_kw, avg_kva, max_kw, max_kva, kwh, kvah, samples)
SELECT deviceid, feederid, {BLK} AS blk,
       AVG(kw), AVG(kva), MAX(kw), MAX(kva), MAX(kwh), MAX(kvah), COUNT(*)
FROM   {VD}
WHERE  datetimestamp >= :s AND datetimestamp < :e
GROUP  BY deviceid, feederid, blk
ON CONFLICT (device_id, feeder_id, block_start) DO UPDATE SET
       avg_kw=EXCLUDED.avg_kw, avg_kva=EXCLUDED.avg_kva,
       max_kw=EXCLUDED.max_kw, max_kva=EXCLUDED.max_kva,
       kwh=EXCLUDED.kwh, kvah=EXCLUDED.kvah, samples=EXCLUDED.samples
""")


def month_iter(start: datetime, end: datetime):
    cur = datetime(start.year, start.month, 1)
    while cur <= end:
        nxt = datetime(cur.year + 1, 1, 1) if cur.month == 12 else datetime(cur.year, cur.month + 1, 1)
        yield cur, nxt
        cur = nxt


def main() -> None:
    args = sys.argv[1:]
    with engine.begin() as conn:
        dmin, dmax = conn.execute(text(f"SELECT MIN(datetimestamp), MAX(datetimestamp) FROM {VD}")).one()
        if dmin is None:
            print("no source data"); return

        if args and args[0] == "--incremental":
            last = conn.execute(text(
                "SELECT last_block FROM pems_rollup_state WHERE rollup_key='meter_15min'")).scalar()
            start = (last - timedelta(minutes=15)) if last else dmin  # redo the last partial block
            windows = [(start, dmax + timedelta(minutes=1))]
        elif args:
            y, m = int(args[0][:4]), int(args[0][5:7])
            windows = [(datetime(y, m, 1),
                        datetime(y, m, monthrange(y, m)[1], 23, 59, 59) + timedelta(seconds=1))]
        else:
            windows = list(month_iter(dmin, dmax))

        total = 0
        for s, e in windows:
            n = conn.execute(INSERT_SQL, {"s": s, "e": e}).rowcount
            total += n
            print(f"  {s:%Y-%m}  ->  {n} block-rows")
        conn.execute(text(
            "INSERT INTO pems_rollup_state (rollup_key, last_block) VALUES ('meter_15min', :b) "
            "ON CONFLICT (rollup_key) DO UPDATE SET last_block=EXCLUDED.last_block"), {"b": dmax})
        cnt = conn.execute(text("SELECT COUNT(*) FROM pems_meter_15min")).scalar()
        print(f"done. affected {total}; table now holds {cnt} rows through {dmax}.")


if __name__ == "__main__":
    main()

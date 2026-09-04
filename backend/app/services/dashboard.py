"""Executive dashboard aggregation over live em_* meter data + pems_ masters.

All figures are live (register-delta consumption, latest instantaneous readings). Values
that depend on modules not yet built (energy cost in Rs, SAP posting status, expected
bill) are returned as null/flagged so the UI can show them as pending rather than faking
numbers.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.config import get_settings

settings = get_settings()
VALUEDATA = f"em_valuedata_{settings.client_id.lower()}"
from app.services.plant import MAIN  # 132 kV grid incomer, from config
CONTRACT_KVA = 56000
LOOKBACK_MIN = 15


def _f(v) -> float | None:
    return float(v) if v is not None else None


def executive(db: Session, start: str | None = None, end: str | None = None) -> dict:
    """`start`/`end` (both optional, YYYY-MM-DD) are the header date-range picker's
    scope. Omitted entirely -> today, live. A single date (start==end) -> that day's
    snapshot. A wider range -> aggregated over the whole window, compared against the
    immediately-preceding period of equal length ("previous period").

    `live` means the window's exclusive end is still in the future relative to now —
    i.e. the scope includes "right now" and is still accumulating (true for the
    default today-only view, and for any range whose end is today or later).
    """
    now = datetime.now()
    if start or end:
        end = end or start
        start = start or end
        pstart = datetime.strptime(start, "%Y-%m-%d")
        pend = datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)
    else:
        pstart = now.replace(hour=0, minute=0, second=0, microsecond=0)
        pend = pstart + timedelta(days=1)
    live = pend > now
    is_range = (pend - pstart).days > 1
    period_days = max((pend - pstart).days, 1)
    prev_start = pstart - timedelta(days=period_days)

    # bounded to the main incomer so this can use the (DeviceID, FeederID,
    # DateTimeStamp) primary key index — an unfiltered MAX() over the ~20M-row
    # table is a full scan and was the dashboard's dominant load-time cost.
    latest = db.execute(text(
        f"SELECT MAX(DateTimeStamp) FROM {VALUEDATA} "
        f"WHERE DeviceID=:d AND FeederID=:f AND DateTimeStamp>=:s AND DateTimeStamp<:e"
    ), {"d": MAIN[0], "f": MAIN[1], "s": pstart, "e": pend}).scalar()
    if latest is None:
        return {"as_of": None, "date": end, "live": live, "is_range": is_range}

    # bounded above by `latest` — without it, a historical query would fall through
    # to whatever the truly-latest (i.e. today's live) reading is.
    inc = db.execute(text(
        f"""SELECT KW, KVA, KVAR, SYSTEM_PF, FREQUENCY, AVG_VLL, AVG_VLN,
                   VTHD_R, VTHD_Y, VTHD_B, ITHD_R, ITHD_Y, ITHD_B, AMPS_R, AMPS_Y, AMPS_B
            FROM {VALUEDATA} WHERE DeviceID=:d AND FeederID=:f AND DateTimeStamp<=:latest
            ORDER BY DateTimeStamp DESC LIMIT 1"""
    ), {"d": MAIN[0], "f": MAIN[1], "latest": latest}).mappings().first() or {}

    # --- consumption over the whole scope (one day or a multi-day range), vs. the
    # immediately-preceding period of equal length ---
    elapsed = latest - pstart
    period_kwh = _incomer_energy(db, pstart, latest)
    prev_kwh_full = _incomer_energy(db, prev_start, pstart)
    prev_kwh_sametime = _incomer_energy(db, prev_start, prev_start + elapsed)  # fair like-for-like

    plant_kw = _f(inc.get("kw")) or 0.0
    plant_kva = _f(inc.get("kva")) or 0.0

    # --- plant load breakdown (latest KW per feeder by class, as of `latest`) ---
    breakdown = _load_breakdown(db, latest, pend)
    furnace_kw = breakdown["furnace"]
    aux_kw = max(plant_kw - furnace_kw, 0.0)

    # --- load factor (energy over the scope / (peak demand * hours elapsed)) ---
    peak_in_scope = db.execute(text(
        f"SELECT MAX(KW) FROM {VALUEDATA} WHERE DeviceID=:d AND FeederID=:f "
        f"AND DateTimeStamp>=:t AND DateTimeStamp<:e"
    ), {"d": MAIN[0], "f": MAIN[1], "t": pstart, "e": pend}).scalar()
    hours = max(elapsed.total_seconds() / 3600, 0.5)
    load_factor = (period_kwh / (float(peak_in_scope) * hours)) if peak_in_scope and period_kwh else None

    return {
        "as_of": latest.isoformat(),
        "date": (pend - timedelta(days=1)).date().isoformat(),
        "range": {"start": pstart.date().isoformat(), "end": (pend - timedelta(days=1)).date().isoformat()},
        "live": live,
        "is_range": is_range,
        "demand": {
            "kw": plant_kw, "mw": round(plant_kw / 1000, 2),
            "kva": plant_kva, "contract_kva": CONTRACT_KVA,
            "utilization_pct": round(plant_kva / CONTRACT_KVA * 100, 1) if plant_kva else 0.0,
        },
        "power_factor": _f(inc.get("system_pf")),
        "consumption": {
            "today_mwh": round(period_kwh / 1000, 2) if period_kwh is not None else None,
            "yesterday_mwh": round(prev_kwh_full / 1000, 2) if prev_kwh_full is not None else None,
            "change_pct": _pct_change(period_kwh, prev_kwh_sametime),  # same time-of-day / fair comparison
        },
        "load_factor": round(load_factor, 3) if load_factor else None,
        "plant_load": {
            "grid_mw": round(plant_kw / 1000, 2),
            "furnace_mw": round(furnace_kw / 1000, 2),
            "auxiliary_mw": round(aux_kw / 1000, 2),
            "gcp_mw": round(breakdown["gcp"] / 1000, 2),
            "briquetting_mw": round(breakdown["briquetting"] / 1000, 2),
            "utility_mw": round(breakdown["utility"] / 1000, 2),
            "furnace_pct": round(furnace_kw / plant_kw * 100, 1) if plant_kw else 0.0,
            "auxiliary_pct": round(aux_kw / plant_kw * 100, 1) if plant_kw else 0.0,
        },
        "demand_trend": (
            _demand_trend_daily(db, pstart, pend, prev_start) if is_range
            else _demand_trend_hourly(db, pstart, prev_start, latest)
        ),
        "tod_breakup": _tod_breakup(db, pstart, pend),
        "top_feeders": _top_feeders(db, pstart, pend),
        "power_quality": {
            "power_factor": _f(inc.get("system_pf")),
            "voltage_kv": round((_f(inc.get("avg_vll")) or 0) / 1000, 1),
            "frequency": _f(inc.get("frequency")),
            "thd_v": _avg(inc, ["vthd_r", "vthd_y", "vthd_b"]),
            "thd_i": _avg(inc, ["ithd_r", "ithd_y", "ithd_b"]),
            "unbalance_pct": _unbalance(inc),
        },
        "status": _status(db, pstart, latest, pend),
        # pending modules (no fabricated values)
        "pending": {
            "energy_cost": None, "expected_bill": None, "sap_posting_status": None,
            "note": "Cost/bill/SAP figures activate with Accounting, Reconciliation and SAP modules.",
        },
    }


def _incomer_energy(db: Session, start: datetime, end: datetime) -> float | None:
    row = db.execute(text(
        f"SELECT MIN(KWH) lo, MAX(KWH) hi FROM {VALUEDATA} "
        f"WHERE DeviceID=:d AND FeederID=:f AND DateTimeStamp>=:s AND DateTimeStamp<:e"
    ), {"d": MAIN[0], "f": MAIN[1], "s": start, "e": end}).mappings().one()
    if row["lo"] is None or row["hi"] is None:
        return None
    d = float(row["hi"]) - float(row["lo"])
    return d if d >= 0 else None


def _latest_per_feeder(db: Session, latest: datetime, day_end: datetime):
    since = latest - timedelta(minutes=LOOKBACK_MIN)
    return db.execute(text(
        f"""SELECT v.DeviceID, v.FeederID, v.KW
            FROM {VALUEDATA} v
            JOIN (SELECT DeviceID, FeederID, MAX(DateTimeStamp) ts FROM {VALUEDATA}
                  WHERE DateTimeStamp>=:s AND DateTimeStamp<:e GROUP BY DeviceID, FeederID) last
              ON v.DeviceID=last.DeviceID AND v.FeederID=last.FeederID AND v.DateTimeStamp=last.ts"""
    ), {"s": since, "e": day_end}).mappings().all()


def _load_breakdown(db: Session, latest: datetime, day_end: datetime) -> dict:
    rows = _latest_per_feeder(db, latest, day_end)
    meters = {(m["device_id"], m["feeder_id"]): m for m in db.execute(text(
        "SELECT device_id, feeder_id, role, section FROM pems_meter"
    )).mappings()}
    agg = {"furnace": 0.0, "gcp": 0.0, "briquetting": 0.0, "utility": 0.0}
    for r in rows:
        m = meters.get((r["deviceid"], r["feederid"]))
        if not m or m["role"] in ("grid", "incomer"):
            continue
        kw = _f(r["kw"]) or 0.0
        sec = (m["section"] or "").lower()
        if m["role"] == "furnace":
            agg["furnace"] += kw
        elif "gcp" in sec:
            agg["gcp"] += kw
        elif "briq" in sec:
            agg["briquetting"] += kw
        elif sec in ("air", "water"):
            agg["utility"] += kw
    return agg


def _demand_trend_hourly(db: Session, today: datetime, yest: datetime, latest: datetime) -> list[dict]:
    rows = db.execute(text(
        f"""SELECT DATE(datetimestamp) d, EXTRACT(HOUR FROM datetimestamp)::int h, AVG(kw) akw
            FROM {VALUEDATA}
            WHERE deviceid=:dev AND feederid=:f AND datetimestamp>=:y AND datetimestamp<:e
            GROUP BY DATE(datetimestamp), EXTRACT(HOUR FROM datetimestamp)"""
    ), {"dev": MAIN[0], "f": MAIN[1], "y": yest, "e": today + timedelta(days=1)}).mappings().all()
    tmap = {r["h"]: r["akw"] for r in rows if r["d"] == today.date()}
    ymap = {r["h"]: r["akw"] for r in rows if r["d"] == yest.date()}
    out = []
    for h in range(24):
        out.append({
            "hour": f"{h:02d}:00",
            "today_mw": round(float(tmap[h]) / 1000, 2) if h in tmap else None,
            "yesterday_mw": round(float(ymap[h]) / 1000, 2) if h in ymap else None,
        })
    return out


def _demand_trend_daily(db: Session, pstart: datetime, pend: datetime, prev_start: datetime) -> list[dict]:
    """One point per calendar day in a multi-day range: that day's total incomer
    energy for this period vs. the matching day in the immediately-preceding period
    of equal length. Reuses the hourly trend's field names (`today_mw`/`yesterday_mw`)
    even though the values here are daily MWh, not instantaneous MW — the frontend
    switches labels/units based on `is_range` rather than the field names."""
    out = []
    days = (pend - pstart).days
    for i in range(days):
        day = pstart + timedelta(days=i)
        prev_day = prev_start + timedelta(days=i)
        cur = _incomer_energy(db, day, day + timedelta(days=1))
        prev = _incomer_energy(db, prev_day, prev_day + timedelta(days=1))
        out.append({
            "hour": day.strftime("%d %b"),
            "today_mw": round(cur / 1000, 2) if cur is not None else None,
            "yesterday_mw": round(prev / 1000, 2) if prev is not None else None,
        })
    return out


def _tod_breakup(db: Session, today: datetime, day_end: datetime) -> dict:
    """Bucket the scope's incomer energy into TOD slots via per-day hourly register
    deltas. Grouped by (day, hour) rather than hour alone — over a multi-day range,
    grouping by hour alone would merge e.g. every day's 10:00 reading into one bucket
    and take MIN/MAX across days, wildly overstating that bucket's energy."""
    rows = db.execute(text(
        f"""SELECT DATE(datetimestamp) d, EXTRACT(HOUR FROM datetimestamp)::int h, MIN(kwh) lo, MAX(kwh) hi
            FROM {VALUEDATA}
            WHERE deviceid=:d AND feederid=:f AND datetimestamp>=:t AND datetimestamp<:e
            GROUP BY DATE(datetimestamp), EXTRACT(HOUR FROM datetimestamp)"""
    ), {"d": MAIN[0], "f": MAIN[1], "t": today, "e": day_end}).mappings().all()
    solar = normal = peak = 0.0
    for r in rows:
        if r["lo"] is None or r["hi"] is None:
            continue
        e = float(r["hi"]) - float(r["lo"])
        if e < 0:
            continue
        h = r["h"]
        if 8 <= h < 16:
            solar += e
        elif 18 <= h < 24:
            peak += e
        else:
            normal += e
    total = solar + normal + peak
    return {
        "solar_mwh": round(solar / 1000, 2), "normal_mwh": round(normal / 1000, 2),
        "peak_mwh": round(peak / 1000, 2), "total_mwh": round(total / 1000, 2),
    }


def _top_feeders(db: Session, today: datetime, day_end: datetime) -> list[dict]:
    """Top consumers ranked by average KW today.

    KW is uniform across meters, unlike the KWH registers (mixed units/scales), so ranking
    and MWh estimation are done from average power x elapsed hours. Incomer/transformer
    metering points are excluded so only real consumers appear.
    """
    consumers = {(m["device_id"], m["feeder_id"]): m for m in db.execute(text(
        "SELECT device_id, feeder_id, feeder_name, role, section FROM pems_meter "
        "WHERE role NOT IN ('grid','incomer') AND is_enabled=true"
    )).mappings()}
    rows = db.execute(text(
        f"""SELECT DeviceID, FeederID, AVG(KW) akw
            FROM {VALUEDATA}
            WHERE DateTimeStamp>=:t AND DateTimeStamp<:e
            GROUP BY DeviceID, FeederID"""
    ), {"t": today, "e": day_end}).mappings().all()
    ranked = []
    for r in rows:
        key = (r["deviceid"], r["feederid"])
        if key not in consumers or r["akw"] is None:
            continue
        ranked.append((consumers[key], float(r["akw"])))
    ranked.sort(key=lambda x: x[1], reverse=True)
    return [{
        "device_id": m["device_id"], "feeder_id": m["feeder_id"],
        "name": m["feeder_name"], "section": m["section"],
        "avg_mw": round(kw / 1000, 2),
    } for m, kw in ranked[:5]]


def _status(db: Session, today: datetime, latest: datetime, day_end: datetime) -> dict:
    since = latest - timedelta(minutes=LOOKBACK_MIN)
    try:
        total_dev = db.execute(text("SELECT COUNT(*) FROM em_deviceinfo WHERE ClientID=:c"),
                               {"c": settings.client_id}).scalar()
    except ProgrammingError:
        # em_deviceinfo (RTU master) not synced into this database yet — degrade rather
        # than fail the whole dashboard over an unavailable device count.
        db.rollback()
        total_dev = None
    dev_online = db.execute(text(
        f"SELECT COUNT(DISTINCT DeviceID) FROM {VALUEDATA} WHERE DateTimeStamp>=:s AND DateTimeStamp<:e"
    ), {"s": since, "e": day_end}).scalar()
    total_fdr = db.execute(text("SELECT COUNT(*) FROM pems_meter")).scalar()
    fdr_online = db.execute(text(
        f"SELECT COUNT(DISTINCT (DeviceID, FeederID)) FROM {VALUEDATA} WHERE DateTimeStamp>=:s AND DateTimeStamp<:e"
    ), {"s": since, "e": day_end}).scalar()
    points_today = db.execute(text(
        f"SELECT COUNT(*) FROM {VALUEDATA} WHERE DateTimeStamp>=:t AND DateTimeStamp<:e"
    ), {"t": today, "e": day_end}).scalar()
    return {
        "last_update": latest.isoformat(),
        "rtus_online": dev_online, "rtus_total": total_dev,
        "feeders_online": fdr_online, "feeders_total": total_fdr,
        "data_points_today": points_today,
        "healthy": (dev_online == total_dev) if total_dev is not None else None,
    }


def _avg(row, keys) -> float | None:
    vals = [_f(row.get(k)) for k in keys]
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _unbalance(row) -> float | None:
    amps = [_f(row.get(k)) for k in ("amps_r", "amps_y", "amps_b")]
    amps = [a for a in amps if a is not None and a > 0]
    if len(amps) < 3:
        return None
    avg = sum(amps) / 3
    return round(max(abs(a - avg) for a in amps) / avg * 100, 2) if avg else None


def _pct_change(cur, prev) -> float | None:
    if cur is None or prev in (None, 0):
        return None
    return round((cur - prev) / prev * 100, 1)

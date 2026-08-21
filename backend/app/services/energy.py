"""Energy read services over the read-only em_* meter tables.

These functions never write to em_* tables. Consumption is computed as the delta of the
cumulative KWH/KVAH registers over a window; instantaneous values (KW/KVA/PF) come from
the latest reading. Kept in Python (not vendor SQL) where portability matters.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings

settings = get_settings()

VALUEDATA = f"em_valuedata_{settings.client_id.lower()}"  # em_valuedata_ci1001

# main grid incomer used to represent plant draw vs the 56 MVA contract demand
MAIN_INCOMER = ("DI1001", 21)   # "132 KV Main Incomer"
OVERVIEW_LOOKBACK_MIN = 15      # window to consider a feeder "currently reporting"


def list_feeders(db: Session) -> list[dict]:
    """Enabled feeders with their device names.

    Device names are joined in Python (not SQL) because em_feederinfo and em_deviceinfo
    use different collations, which makes a SQL join on DeviceID non-portable.
    """
    devices = {
        r["deviceid"]: r["devicename"]
        for r in db.execute(text(
            "SELECT DeviceID, DeviceName FROM em_deviceinfo "
            "WHERE ClientID = :cid AND PlantID = :pid"
        ), {"cid": settings.client_id, "pid": settings.plant_id}).mappings()
    }
    rows = db.execute(text(
        """
        SELECT DeviceID, FeederID, FeederName, FeederLocation,
               IsEnabled, IsVirtualFeeder
        FROM   em_feederinfo
        WHERE  ClientID = :cid AND PlantID = :pid
        ORDER BY DeviceID, FeederID
        """
    ), {"cid": settings.client_id, "pid": settings.plant_id}).mappings().all()
    out = []
    for r in rows:
        d = dict(r)
        d["devicename"] = devices.get(r["deviceid"])
        out.append(d)
    return out


def latest_reading_time(db: Session) -> datetime | None:
    return db.execute(text(f"SELECT MAX(DateTimeStamp) FROM {VALUEDATA}")).scalar()


def plant_overview(db: Session) -> dict:
    """Snapshot for the monitoring landing page.

    Plant draw is taken from the main 132 kV grid incomer (not a sum of all feeders,
    which would double-count incomers and sub-feeders). Also reports how many feeders
    are currently reporting within the lookback window.
    """
    latest = latest_reading_time(db)
    if latest is None:
        return {"as_of": None, "plant_kw": 0, "reporting_feeders": 0}

    since = latest - timedelta(minutes=OVERVIEW_LOOKBACK_MIN)

    reporting = db.execute(text(
        f"""
        SELECT COUNT(DISTINCT (DeviceID, FeederID)) AS n
        FROM   {VALUEDATA}
        WHERE  DateTimeStamp >= :since
        """
    ), {"since": since}).scalar()

    incomer = db.execute(text(
        f"""
        SELECT KW, KVA, KVAR, SYSTEM_PF, AVG_VLL, FREQUENCY, DateTimeStamp
        FROM   {VALUEDATA}
        WHERE  DeviceID = :dev AND FeederID = :fdr
        ORDER BY DateTimeStamp DESC
        LIMIT 1
        """
    ), {"dev": MAIN_INCOMER[0], "fdr": MAIN_INCOMER[1]}).mappings().first()

    contract_demand_kva = 56000
    plant_kva = float(incomer["kva"]) if incomer and incomer["kva"] else 0.0

    return {
        "as_of": latest.isoformat(),
        "reporting_feeders": int(reporting or 0),
        "plant_kw": float(incomer["kw"]) if incomer and incomer["kw"] else 0.0,
        "plant_mw": round(float(incomer["kw"]) / 1000, 3) if incomer and incomer["kw"] else 0.0,
        "plant_kva": plant_kva,
        "power_factor": float(incomer["system_pf"]) if incomer and incomer["system_pf"] else None,
        "frequency": float(incomer["frequency"]) if incomer and incomer["frequency"] else None,
        "avg_vll": float(incomer["avg_vll"]) if incomer and incomer["avg_vll"] else None,
        "contract_demand_kva": contract_demand_kva,
        "demand_utilization_pct": round(plant_kva / contract_demand_kva * 100, 1)
        if plant_kva else 0.0,
    }


def feeder_energy(db: Session, device_id: str, feeder_id: int,
                  start: datetime, end: datetime) -> dict:
    """Energy (kWh/kVAh) for a feeder over [start, end) as the register delta."""
    row = db.execute(text(
        f"""
        SELECT MIN(KWH) AS kwh_min, MAX(KWH) AS kwh_max,
               MIN(KVAH) AS kvah_min, MAX(KVAH) AS kvah_max
        FROM   {VALUEDATA}
        WHERE  DeviceID = :dev AND FeederID = :fdr
          AND  DateTimeStamp >= :start AND DateTimeStamp < :end
        """
    ), {"dev": device_id, "fdr": feeder_id, "start": start, "end": end}).mappings().one()

    kwh = _delta(row["kwh_min"], row["kwh_max"])
    kvah = _delta(row["kvah_min"], row["kvah_max"])
    return {"device_id": device_id, "feeder_id": feeder_id,
            "start": start.isoformat(), "end": end.isoformat(),
            "kwh": kwh, "kvah": kvah}


def _delta(lo, hi) -> float | None:
    """Register delta with a naive reset guard (negative delta -> None)."""
    if lo is None or hi is None:
        return None
    d = float(hi) - float(lo)
    return round(d, 2) if d >= 0 else None

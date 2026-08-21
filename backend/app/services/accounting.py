"""Module 2 — Energy Accounting.

Digital replacement for the manual "Energy Master" sheet. Computes the monthly energy
balance and allocates it to logical loads and SAP cost centers.

  Grid = Furnaces + Auxiliary          (Auxiliary is the residual)
  Auxiliary = sum(individual loads) + Miscellaneous/Line-loss

Energy is computed by INTEGRATING KW (instantaneous power) over the period, not from the
KWH registers — the registers are in mixed units/scales across feeders, whereas KW is
uniform. energy(kWh) = mean(KW) x period_hours. This is consistent for every feeder.
"""
from __future__ import annotations

import json
from calendar import monthrange
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services import settings as cfg

settings = get_settings()
VALUEDATA = f"em_valuedata_{settings.client_id.lower()}"
from app.services.plant import MAIN  # main incomer meter, from config

# Plant meter grossing factor from the BAL 15-min load-pattern formula
# (energy = register delta × 1.01, skipping readings ≤ 100). Applied to the
# register-delta energy so PEMS matches the plant Energy Master (~0.5%). This is
# the fallback default; the live value is read date-effectively from pems_constant.
METER_MULT_FACTOR = 1.01


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    y, m = int(month[:4]), int(month[5:7])
    start = datetime(y, m, 1)
    end = datetime(y, m, monthrange(y, m)[1], 23, 59, 59)
    return start, end


def available_months(db: Session) -> list[str]:
    # Source the month list from the 15-min rollup (not raw em_valuedata) so the
    # dropdown can only offer months the balance engine can actually fill — and so
    # the DISTINCT scan hits the small rollup instead of the huge raw table.
    rows = db.execute(text(
        "SELECT DISTINCT to_char(block_start, 'YYYY-MM') ym FROM pems_meter_15min ORDER BY ym DESC"
    )).scalars().all()
    return list(rows)


def _period_energy_kwh(db: Session, start: datetime, end: datetime) -> dict:
    """Per-feeder energy (kWh) over [start, end) from the 15-min rollup.

    Prefers the metered kWh-register delta — this is the plant Energy Master's
    method and it keeps counting through data gaps. Per the BAL load-pattern
    formula, readings ≤ 100 are treated as invalid (meter offline) and the delta
    is grossed by METER_MULT_FACTOR (1.01). The register is stored raw and its unit
    differs per meter (some kWh, some MWh), so it is scaled to the KW-integration
    estimate (SUM(avg_kw)*0.25), which is uniform and within a few %. If the
    register is missing or looks corrupt (reset/rollover → off by >50% from the
    integral), fall back to KW-integration.
    """
    return {k: v["kwh"] for k, v in _period_energy(db, start, end).items()}


def _scaled(reg, integ: float, factor: float) -> float:
    """Register-delta grossed by the meter factor, scaled to the KW/KVA integral
    to resolve per-meter unit ambiguity; falls back to the integral if the
    register looks corrupt (reset/rollover → off by >50%)."""
    integ = float(integ or 0.0)
    reg = float(reg) if reg is not None else None
    if reg is not None and reg > 0 and integ > 0:
        best = min((reg, reg * 1000.0, reg / 1000.0), key=lambda c: abs(c - integ) / integ)
        if abs(best - integ) / integ <= 0.5:                   # plausible → trust the register
            return best * factor                               # plant grossing factor (per-meter)
    return integ


def _period_energy(db: Session, start: datetime, end: datetime) -> dict:
    """Per-feeder active (kWh) and apparent (kVAh) energy over [start, end).

    Each meter's register delta is grossed by its OWN multiplication factor —
    a per-meter override from pems_meter_factor if present, else the global
    ``meter_mult_factor`` constant (date-effective). Readings ≤ 100 are treated
    as meter-offline and skipped (BAL load-pattern rule).
    """
    factors = cfg.meter_factors(db, start.date())
    gmf = cfg.const_val(db, "meter_mult_factor", start.date(), METER_MULT_FACTOR)
    rows = db.execute(text(
        """SELECT device_id, feeder_id,
                  SUM(avg_kw)  * 0.25 AS kwint,
                  SUM(avg_kva) * 0.25 AS kvaint,
                  MAX(CASE WHEN kwh  > 100 THEN kwh  END) - MIN(CASE WHEN kwh  > 100 THEN kwh  END) AS regkwh,
                  MAX(CASE WHEN kvah > 100 THEN kvah END) - MIN(CASE WHEN kvah > 100 THEN kvah END) AS regkvah
           FROM pems_meter_15min
           WHERE block_start >= :s AND block_start < :e
           GROUP BY device_id, feeder_id"""
    ), {"s": start, "e": end}).mappings().all()
    out: dict = {}
    for r in rows:
        f = factors.get((r["device_id"], r["feeder_id"]), gmf)
        out[(r["device_id"], r["feeder_id"])] = {
            "kwh": _scaled(r["regkwh"], r["kwint"], f),
            "kvah": _scaled(r["regkvah"], r["kvaint"], f),
        }
    return out


def monthly_balance(db: Session, month: str, persist: bool = True) -> dict:
    start, month_end = _month_bounds(month)
    latest = db.execute(text("SELECT MAX(block_start) FROM pems_meter_15min")).scalar()
    end = min(month_end, latest) if latest else month_end
    if latest is None or end <= start:
        return {"month": month, "error": "no data for this month"}

    hours = (end - start).total_seconds() / 3600.0

    # Per-feeder active (MWh) + apparent (MVAh) energy from the 15-min rollup.
    pe = _period_energy(db, start, end)
    energy_mwh = {k: v["kwh"] / 1000.0 for k, v in pe.items()}
    apparent_mvah = {k: v["kvah"] / 1000.0 for k, v in pe.items()}

    meters = {(m["device_id"], m["feeder_id"]): m for m in db.execute(text(
        "SELECT device_id, feeder_id, feeder_name, role FROM pems_meter"
    )).mappings()}

    # current feeder->load mappings
    maps = db.execute(text(
        """SELECT m.load_id, m.device_id, m.feeder_id, m.coefficient, m.is_confirmed,
                  l.load_code, l.load_name, l.load_type, l.is_derived,
                  l.sap_costcenter, l.display_order, cc.description AS cc_desc
           FROM pems_load_feeder_map m
           JOIN pems_load l ON l.id = m.load_id
           LEFT JOIN pems_cost_center cc ON cc.sap_costcenter = l.sap_costcenter
           WHERE m.effective_to IS NULL"""
    )).mappings().all()

    grid_mwh = energy_mwh.get(MAIN, 0.0)
    grid_mvah = apparent_mvah.get(MAIN, 0.0)
    furnace_total = sum(e for k, e in energy_mwh.items()
                        if meters.get(k, {}).get("role") == "furnace")
    furnace_total_mvah = sum(e for k, e in apparent_mvah.items()
                             if meters.get(k, {}).get("role") == "furnace")
    aux_total = max(grid_mwh - furnace_total, 0.0)
    aux_total_mvah = max(grid_mvah - furnace_total_mvah, 0.0)

    # aggregate energy per load
    loads: dict[int, dict] = {}
    for mp in maps:
        coeff = float(mp["coefficient"]) if mp["coefficient"] is not None else 1.0
        key = (mp["device_id"], mp["feeder_id"])
        e = energy_mwh.get(key, 0.0) * coeff
        ev = apparent_mvah.get(key, 0.0) * coeff
        ld = loads.setdefault(mp["load_id"], {
            "load_code": mp["load_code"], "load_name": mp["load_name"],
            "load_type": mp["load_type"], "sap_costcenter": mp["sap_costcenter"],
            "costcenter_desc": mp["cc_desc"], "order": mp["display_order"] or 999,
            "mwh": 0.0, "mvah": 0.0, "confirmed": True, "metered": False,
        })
        ld["mwh"] += e
        ld["mvah"] += ev
        if key in pe:                       # this feeder had rollup data in the period
            ld["metered"] = True
        if not mp["is_confirmed"]:
            ld["confirmed"] = False

    furnaces = sorted([l for l in loads.values() if l["load_type"] == "furnace"],
                      key=lambda x: x["order"])
    individual = sorted([l for l in loads.values() if l["load_type"] == "individual"],
                        key=lambda x: x["order"])
    individual_total = sum(l["mwh"] for l in individual)
    individual_total_mvah = sum(l["mvah"] for l in individual)
    misc = aux_total - individual_total
    misc_mvah = aux_total_mvah - individual_total_mvah

    # per cost-center rollup (furnaces + individual)
    cc: dict[str, dict] = {}
    for l in furnaces + individual:
        code = l["sap_costcenter"] or "UNALLOCATED"
        c = cc.setdefault(code, {"sap_costcenter": l["sap_costcenter"],
                                 "description": l["costcenter_desc"], "mwh": 0.0})
        c["mwh"] += l["mwh"]

    result = {
        "month": month,
        "period": {"start": start.isoformat(), "end": end.isoformat(),
                   "hours": round(hours, 1), "complete": end >= month_end},
        "grid_mwh": round(grid_mwh, 3),
        "grid_mvah": round(grid_mvah, 3),
        "furnace_total_mwh": round(furnace_total, 3),
        "furnace_total_mvah": round(furnace_total_mvah, 3),
        "auxiliary_mwh": round(aux_total, 3),
        "auxiliary_mvah": round(aux_total_mvah, 3),
        "furnaces": [_round(l) for l in furnaces],
        "individual_loads": [_round(l) for l in individual],
        "miscellaneous_mwh": round(misc, 3),
        "miscellaneous_mvah": round(misc_mvah, 3),
        "cost_centers": sorted(
            [{"sap_costcenter": c["sap_costcenter"], "description": c["description"],
              "mwh": round(c["mwh"], 3)} for c in cc.values()],
            key=lambda x: -x["mwh"]),
        "method": "KW integration (mean KW x hours); grid from main 132kV incomer",
    }

    if persist:
        db.execute(text(
            """INSERT INTO pems_energy_balance
                 (balance_month, grid_mwh, furnace_mwh, auxiliary_mwh, detail_json)
               VALUES (:m,:g,:f,:a, CAST(:d AS JSONB))
               ON CONFLICT (balance_month) DO UPDATE SET
                 grid_mwh=EXCLUDED.grid_mwh, furnace_mwh=EXCLUDED.furnace_mwh,
                 auxiliary_mwh=EXCLUDED.auxiliary_mwh, detail_json=EXCLUDED.detail_json"""
        ), {"m": month, "g": result["grid_mwh"], "f": result["furnace_total_mwh"],
            "a": result["auxiliary_mwh"], "d": json.dumps(result)})
        db.commit()

    return result


def costcenter_energy(db: Session, start: datetime, end: datetime) -> dict:
    """Per-cost-center energy (kWh) over [start, end) via KW integration + coefficient
    formulas. Shared by SAP posting (daily) and reporting.
    """
    latest = db.execute(text("SELECT MAX(block_start) FROM pems_meter_15min")).scalar()
    if latest:
        end = min(end, latest)
    hours = max((end - start).total_seconds() / 3600.0, 0.0)
    if hours <= 0:
        return {"grid_kwh": 0.0, "hours": 0, "cost_centers": []}

    energy = _period_energy_kwh(db, start, end)   # register-delta based (kWh per feeder)

    maps = db.execute(text(
        """SELECT m.device_id, m.feeder_id, m.coefficient, l.sap_costcenter, cc.description
           FROM pems_load_feeder_map m JOIN pems_load l ON l.id=m.load_id
           LEFT JOIN pems_cost_center cc ON cc.sap_costcenter=l.sap_costcenter
           WHERE m.effective_to IS NULL AND l.sap_costcenter IS NOT NULL"""
    )).mappings().all()

    cc: dict[str, dict] = {}
    for m in maps:
        e = energy.get((m["device_id"], m["feeder_id"]), 0.0) * (float(m["coefficient"]) if m["coefficient"] is not None else 1.0)
        c = cc.setdefault(m["sap_costcenter"], {"sap_costcenter": m["sap_costcenter"],
                                                "description": m["description"], "kwh": 0.0})
        c["kwh"] += e

    return {
        "grid_kwh": round(energy.get(MAIN, 0.0), 2),
        "hours": round(hours, 2),
        "cost_centers": sorted(
            [{"sap_costcenter": c["sap_costcenter"], "description": c["description"], "kwh": round(c["kwh"], 2)}
             for c in cc.values()], key=lambda x: -x["kwh"]),
    }


def _round(l: dict) -> dict:
    return {"load_code": l["load_code"], "load_name": l["load_name"],
            "sap_costcenter": l["sap_costcenter"], "costcenter_desc": l["costcenter_desc"],
            "mwh": round(l["mwh"], 3), "mvah": round(l.get("mvah", 0.0), 3),
            "confirmed": l["confirmed"], "no_data": not l.get("metered", False)}

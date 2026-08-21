"""Automated tariff / rate engine (FTD / MTD / YTD).

Reproduces BAL's TPNODL daily-bill workbook. The bill is computed on the **132 kV main
incomer only** (TPNODL meters there); the resulting blended per-unit rate is then applied
to internal cost-center consumption.

Formula (confirmed against the 'Electricity Bill- Daily' workbook, Jun-2026):
  energy   = kVAh split by load-factor slab:
               LF>60%: (60/LF)*kVAh @ slab1 + remainder @ slab2 ; else all @ slab1
  demand   = billable_kVA * 250 / days_in_month * days_elapsed
               billable = MD, floored at 80% of contract demand (MMFC)
  overdraw = max(MD-CD,0) * 250 / days_in_month * days_elapsed
  tod      = peak_kVAh * +0.30  (surcharge)  +  solar_kVAh * -0.20  (incentive)
  lf_rebate= LF>80%: -0.20 * ((LF-80)/LF) * (kVAh-solar)  else 0
  ED       = 9% * (energy + tod_net + lf_rebate)
  total    = energy + tod_net + demand + overdraw + colony + lf_rebate
             + ED + meter_rent + CSC   (last two prorated by days)
  per_unit = total / kWh
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services import settings as cfg

settings = get_settings()
VD = f"em_valuedata_{settings.client_id.lower()}"
from app.services.plant import MAIN  # main incomer meter, from config

# ToD adders (Rs/kVAh) and MMFC floor — fallback defaults. The live values are
# read date-effectively from pems_constant (System Settings → Constants & Factors).
TOD_PEAK_ADDER = 0.30
TOD_SOLAR_INCENTIVE = 0.20
MMFC_FLOOR_PCT = 80
DAYS_BASIS_FIXED = None  # None → use actual days in month


def _tariff(db: Session, on: date) -> dict:
    row = db.execute(text(
        """SELECT * FROM pems_tariff WHERE voltage_class='EHT' AND effective_from<=:d
           AND (effective_to IS NULL OR effective_to>=:d) ORDER BY effective_from DESC LIMIT 1"""
    ), {"d": on}).mappings().first()
    return dict(row) if row else {}


def _incomer_window(db: Session, start: datetime, end: datetime) -> dict:
    """kWh, kVAh (register delta) + ToD kVAh split for the main incomer over [start, end).

    Reads the fast 15-min rollup (pems_meter_15min) rather than raw em_valuedata —
    the rollup carries each block's kWh/kVAh register, so MIN/MAX give the same delta
    ~100x faster. Readings ≤ 100 (meter offline) are excluded."""
    agg = db.execute(text(
        """SELECT MIN(CASE WHEN kwh > 100 THEN kwh END) k0, MAX(CASE WHEN kwh > 100 THEN kwh END) k1,
                  MIN(CASE WHEN kvah > 100 THEN kvah END) v0, MAX(CASE WHEN kvah > 100 THEN kvah END) v1
           FROM pems_meter_15min WHERE device_id=:d AND feeder_id=:f AND block_start>=:s AND block_start<:e"""
    ), {"d": MAIN[0], "f": MAIN[1], "s": start, "e": end}).mappings().one()
    kwh = _delta(agg["k0"], agg["k1"]) or 0.0
    kvah = _delta(agg["v0"], agg["v1"]) or 0.0

    # ToD split via hourly kVAh register deltas. Window boundaries are date-effective
    # constants (Settings → Constants → Time of Day), not hard-coded.
    on = start.date()
    ss = int(cfg.const_val(db, "tod_solar_start_hr", on, 8))
    se = int(cfg.const_val(db, "tod_solar_end_hr", on, 16))
    ps = int(cfg.const_val(db, "tod_peak_start_hr", on, 18))
    pe = int(cfg.const_val(db, "tod_peak_end_hr", on, 24))
    rows = db.execute(text(
        """SELECT EXTRACT(HOUR FROM block_start)::int h, MIN(CASE WHEN kvah > 100 THEN kvah END) lo,
                  MAX(CASE WHEN kvah > 100 THEN kvah END) hi
           FROM pems_meter_15min WHERE device_id=:dev AND feeder_id=:f AND block_start>=:s AND block_start<:e
           GROUP BY DATE(block_start), EXTRACT(HOUR FROM block_start)"""
    ), {"dev": MAIN[0], "f": MAIN[1], "s": start, "e": end}).mappings().all()
    solar = normal = peak = 0.0
    for r in rows:
        e = _delta(r["lo"], r["hi"])
        if e is None:
            continue
        h = r["h"]
        if ss <= h < se:
            solar += e
        elif ps <= h < pe:
            peak += e
        else:
            normal += e
    return {"kwh": kwh, "kvah": kvah, "solar_kvah": solar, "normal_kvah": normal, "peak_kvah": peak}


def _max_demand(db: Session, mstart: datetime, mend: datetime) -> tuple[float, datetime | None]:
    """Maximum 15-minute block demand (kVA) for the incomer and WHEN it occurred.
    The rollup already stores per-block avg_kva, so this is a single indexed lookup."""
    r = db.execute(text(
        """SELECT block_start, avg_kva FROM pems_meter_15min
           WHERE device_id=:d AND feeder_id=:f AND block_start>=:s AND block_start<:e
           ORDER BY avg_kva DESC LIMIT 1"""
    ), {"d": MAIN[0], "f": MAIN[1], "s": mstart, "e": mend}).first()
    if not r:
        return 0.0, None
    return float(r[1] or 0), r[0]


def _bill(cons: dict, md_kva: float, tf: dict, days_in_month: int, days_elapsed: float,
          contract_kva: int, consts: dict | None = None) -> dict:
    c = consts or {}
    tod_peak_adder = float(c.get("tod_peak_adder", TOD_PEAK_ADDER))
    tod_solar_incentive = float(c.get("tod_solar_incentive", TOD_SOLAR_INCENTIVE))
    mmfc_floor = float(c.get("mmfc_floor_pct", MMFC_FLOOR_PCT))
    kwh, kvah = cons["kwh"], cons["kvah"]
    solar, peak = cons["solar_kvah"], cons["peak_kvah"]
    hours = max(days_elapsed * 24, 1)
    slab1 = float(tf.get("slab_lf_low_rate") or 5.80)
    slab2 = float(tf.get("slab_lf_high_rate") or 4.70)
    dc_rate = float(tf.get("demand_charge") or 250)
    ed_pct = float(tf.get("electricity_duty_pct") or 9)
    lf_thr = float(tf.get("lf_threshold_pct") or 60)

    load_factor = (kvah / (md_kva * hours) * 100) if (md_kva and kvah) else 0.0

    # energy (load-factor slabs). NB: the workbook's "- solar" subtracts open-access solar
    # GENERATION (BAL has none), NOT the ToD solar-hours kVAh — so energy uses full kVAh.
    net = kvah
    if load_factor > lf_thr and load_factor > 0:
        s1_units = lf_thr / load_factor * kvah
        s2_units = kvah - s1_units
    else:
        s1_units = net
        s2_units = 0.0
    s1_units = max(s1_units, 0.0)
    s2_units = max(s2_units, 0.0)
    energy = s1_units * slab1 + s2_units * slab2

    # ToD
    tod_peak = peak * tod_peak_adder
    tod_solar = -solar * tod_solar_incentive
    tod_net = tod_peak + tod_solar

    # demand (projected) + overdrawal, with MMFC floor
    step = md_kva if md_kva > contract_kva else (md_kva if md_kva > mmfc_floor / 100 * contract_kva
                                                 else mmfc_floor / 100 * contract_kva)
    proj = (days_elapsed / days_in_month)
    demand = step * dc_rate * proj
    overdraw = (max(md_kva - contract_kva, 0) * dc_rate) * proj

    # high-load-factor rebate
    lf_rebate = (-TOD_SOLAR_INCENTIVE * ((load_factor - 80) / load_factor) * net) if load_factor > 80 else 0.0

    electricity = energy + tod_net + demand + overdraw + lf_rebate
    ed = (energy + tod_net + lf_rebate) * ed_pct / 100
    meter_rent = float(tf.get("meter_rent") or 2000) * proj
    csc = float(tf.get("customer_service_charge") or 700) * proj
    total = electricity + ed + meter_rent + csc
    per_unit = (total / kwh) if kwh else 0.0

    return {
        "kwh": round(kwh, 1), "kvah": round(kvah, 1),
        "solar_kvah": round(solar, 1), "peak_kvah": round(peak, 1), "normal_kvah": round(cons["normal_kvah"], 1),
        "md_kva": round(md_kva, 1), "billable_kva": round(step, 1),
        "contract_kva": contract_kva, "load_factor_pct": round(load_factor, 2),
        "days_in_month": days_in_month, "days_elapsed": round(days_elapsed, 2),
        "components": {
            "energy": round(energy, 2), "tod_surcharge": round(tod_peak, 2),
            "tod_incentive": round(tod_solar, 2), "demand": round(demand, 2),
            "overdrawal": round(overdraw, 2), "lf_rebate": round(lf_rebate, 2),
            "electricity_duty": round(ed, 2), "meter_rent": round(meter_rent, 2),
            "customer_service_charge": round(csc, 2),
        },
        # energy split across the two load-factor slabs (so the bill can show
        # how much is charged at the ≤threshold rate vs the >threshold rate)
        "energy_slabs": {
            "threshold_pct": round(lf_thr, 2),
            "s1_kvah": round(s1_units, 1), "s1_rate": slab1, "s1_amount": round(s1_units * slab1, 2),
            "s2_kvah": round(s2_units, 1), "s2_rate": slab2, "s2_amount": round(s2_units * slab2, 2),
        },
        "total": round(total, 2),
        "per_unit_rate": round(per_unit, 4),
    }


def _load_consts(db: Session, on: date) -> dict:
    """Date-effective operational constants for the rate engine."""
    return {k: cfg.const_val(db, k, on) for k in
            ("tod_peak_adder", "tod_solar_incentive", "mmfc_floor_pct", "contract_demand_kva")}


def _latest_block(db: Session):
    """Most recent data timestamp — from the fast rollup, not raw em_valuedata."""
    return db.execute(text("SELECT MAX(block_start) FROM pems_meter_15min")).scalar()


def compute(db: Session, day: str, level: str = "mtd") -> dict:
    d = datetime.strptime(day, "%Y-%m-%d")
    latest = _latest_block(db)
    consts = _load_consts(db, d.date())
    contract = int(consts["contract_demand_kva"])
    tf = _tariff(db, d.date())

    if level == "ftd":
        start, end = d, d + timedelta(days=1)
        mstart = d.replace(day=1)
        dim = monthrange(d.year, d.month)[1]
        cons = _incomer_window(db, start, min(end, latest) if latest else end)
        md, md_at = _max_demand(db, mstart, min(mstart.replace(day=dim, hour=23, minute=59), latest) if latest else end)
        return {"level": "ftd", "date": day, "md_at": md_at.isoformat() if md_at else None,
                **_bill(cons, md, tf, dim, 1, contract, consts)}

    if level == "mtd":
        start = d.replace(day=1)
        end = min(d + timedelta(days=1), latest) if latest else d + timedelta(days=1)
        dim = monthrange(d.year, d.month)[1]
        elapsed = (end - start).total_seconds() / 86400
        cons = _incomer_window(db, start, end)
        md, md_at = _max_demand(db, start, end)
        return {"level": "mtd", "date": day, "md_at": md_at.isoformat() if md_at else None,
                **_bill(cons, md, tf, dim, elapsed, contract, consts)}

    # ytd: full financial year (Apr..Mar) containing the day, to latest data
    fy = _fy_start_year(d.date())
    res = fy_months(db, f"{fy}-04-01", f"{fy + 1}-03-31")
    return {"level": "ytd", "date": day, "fy_start": f"{fy}-04-01",
            "total": res["total"], "kwh": res["kwh"],
            "per_unit_rate": res["per_unit_rate"], "months": res["months"]}


def _fy_start_year(d: date) -> int:
    """Indian financial year start year (Apr–Mar): month ≥ Apr → this year, else last."""
    return d.year if d.month >= 4 else d.year - 1


def _fy_label(d: date) -> str:
    y = _fy_start_year(d)
    return f"FY{y % 100:02d}-{(y + 1) % 100:02d}"


def _month_summary(db: Session, cur: datetime, latest) -> dict | None:
    """One month's bill summary: total, kWh, ₹/kWh, load factor, power factor.
    Uses that month's own date-effective tariff/constants. None if no usable data."""
    dim = monthrange(cur.year, cur.month)[1]
    mend_full = datetime(cur.year, cur.month, dim, 23, 59, 59)
    end = min(mend_full, latest) if latest else mend_full
    elapsed = max((end - cur).total_seconds() / 86400, 0)
    if elapsed <= 0:
        return None
    on = cur.date()
    tf = _tariff(db, on)
    consts = _load_consts(db, on)
    contract = int(consts["contract_demand_kva"])
    cons = _incomer_window(db, cur, end)
    md, _ = _max_demand(db, cur, end)
    b = _bill(cons, md, tf, dim, elapsed, contract, consts)
    if b["kwh"] <= 0:
        return None
    pf = (b["kwh"] / b["kvah"]) if b["kvah"] else 0.0
    return {"month": cur.strftime("%Y-%m"), "fy": _fy_label(on),
            "total": b["total"], "kwh": b["kwh"], "per_unit_rate": b["per_unit_rate"],
            "load_factor_pct": b["load_factor_pct"], "power_factor": round(min(pf, 1.0), 4)}


def fy_months(db: Session, start_day: str, end_day: str) -> dict:
    """Month-by-month bill rollup for every financial year the [start, end] range
    touches (Apr–Mar). A single date → its full FY; a range crossing FYs → all of them."""
    latest = _latest_block(db)
    ds = datetime.strptime(start_day, "%Y-%m-%d").date()
    de = datetime.strptime(end_day, "%Y-%m-%d").date()
    avail = set(db.execute(text(
        "SELECT DISTINCT to_char(block_start, 'YYYY-MM') FROM pems_meter_15min")).scalars().all())
    months = []
    for fy in range(_fy_start_year(ds), _fy_start_year(de) + 1):
        cur = datetime(fy, 4, 1)
        stop = min(datetime(fy + 1, 3, 31, 23, 59, 59), latest) if latest else datetime(fy + 1, 3, 31)
        while cur <= stop:
            if cur.strftime("%Y-%m") in avail:
                ms = _month_summary(db, cur, latest)
                if ms:
                    months.append(ms)
            cur = datetime(cur.year + 1, 1, 1) if cur.month == 12 else datetime(cur.year, cur.month + 1, 1)
    tot = sum(m["total"] for m in months)
    units = sum(m["kwh"] for m in months)
    return {"start": start_day, "end": end_day, "months": months,
            "fys": sorted({m["fy"] for m in months}),
            "total": round(tot, 2), "kwh": round(units, 1),
            "per_unit_rate": round(tot / units, 4) if units else 0.0}


def _delta(lo, hi):
    if lo is None or hi is None:
        return None
    d = float(hi) - float(lo)
    return d if d >= 0 else None

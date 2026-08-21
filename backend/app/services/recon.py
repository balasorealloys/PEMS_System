"""Module 4 — Bill Reconciliation.

Rebuilds the TPNODL monthly bill from meter data using the SAME authoritative rate
engine as the Bill Working sheet (full load-factor slabs, ToD, demand/MMFC,
overdrawal, LF rebate, ED, meter rent, CSC), then compares it line-by-line to the
actual utility bill entered in pems_bill_actual. Charges the engine doesn't model
(power-factor penalty, DPS) come only from the actual side, so any gap there is
explicit rather than hidden.
"""
from __future__ import annotations

import json
from calendar import monthrange

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import rate

TOLERANCE_PCT = 2.0   # |variance| within this % of the actual counts as "matched"


def _line(name: str, computed: float, actual, note: str | None = None) -> dict:
    a = float(actual) if actual is not None else None
    v = (computed - a) if a is not None else None
    return {
        "component": name,
        "computed": round(computed, 2),
        "actual": round(a, 2) if a is not None else None,
        "variance": round(v, 2) if v is not None else None,
        "variance_pct": round(v / a * 100, 2) if (v is not None and a) else None,
        "note": note,
    }


def compute(db: Session, month: str) -> dict:
    y, m = int(month[:4]), int(month[5:7])
    dim = monthrange(y, m)[1]
    day = f"{month}-{dim:02d}"

    # computed bill = full-month run of the authoritative engine (MTD on the last day)
    rc = rate.compute(db, day, "mtd")
    c = rc.get("components", {})
    if not c:
        return {"month": month, "components": [], "note": "No computed bill for this month."}

    actual = db.execute(text("SELECT * FROM pems_bill_actual WHERE bill_month=:m"),
                        {"m": month}).mappings().first()

    def A(field):
        return float(actual[field]) if actual and actual[field] is not None else None

    tod_net = c.get("tod_surcharge", 0.0) + c.get("tod_incentive", 0.0)
    demand_total = c.get("demand", 0.0) + c.get("overdrawal", 0.0)
    fixed = c.get("meter_rent", 0.0) + c.get("customer_service_charge", 0.0)

    components = [
        _line("Energy Charge", c.get("energy", 0.0), A("energy_charge")),
        _line("Time of Day (net)", tod_net, A("tod_charge"), "Peak surcharge + solar incentive"),
        _line("Demand / MMFC", demand_total, A("demand_charge"), "Incl. overdrawal penalty"),
        _line("Load-Factor Rebate", c.get("lf_rebate", 0.0), None),
        _line("Power-Factor Penalty", 0.0, A("pf_charge"), "Not modelled by the engine — actual only"),
        _line("Electricity Duty", c.get("electricity_duty", 0.0), A("electricity_duty")),
        _line("Meter Rent + CSC", fixed, None),
        _line("Delayed-Payment Surcharge", 0.0, A("dps"), "Not modelled by the engine — actual only"),
    ]

    computed_total = rc.get("total", 0.0)
    actual_total = A("net_payable")
    total_var = (computed_total - actual_total) if actual_total is not None else None
    total_var_pct = (total_var / actual_total * 100) if (total_var is not None and actual_total) else None
    status = None
    if actual_total is not None:
        status = "matched" if abs(total_var_pct or 0) <= TOLERANCE_PCT else "review"

    return {
        "month": month,
        "has_actual": actual is not None,
        "status": status,
        "inputs": {
            "kwh": round(rc.get("kwh", 0.0), 0), "kvah": round(rc.get("kvah", 0.0), 0),
            "md_kva": round(rc.get("md_kva", 0.0), 0),
            "billable_demand_kva": round(rc.get("billable_kva", 0.0), 0),
            "contract_kva": rc.get("contract_kva", 0),
            "load_factor_pct": rc.get("load_factor_pct", 0.0),
            "per_unit_rate": rc.get("per_unit_rate", 0.0),
            "days": rc.get("days_elapsed", 0), "days_in_month": rc.get("days_in_month", dim),
            "complete": rc.get("days_elapsed", 0) >= dim - 0.5,
        },
        "components": components,
        "computed_total": round(computed_total, 2),
        "actual_total": round(actual_total, 2) if actual_total is not None else None,
        "total_variance": round(total_var, 2) if total_var is not None else None,
        "total_variance_pct": round(total_var_pct, 2) if total_var_pct is not None else None,
        "note": ("Computed with the authoritative tariff engine on the 132 kV incomer register. "
                 "Power-factor penalty and DPS are billed items the engine doesn't model — enter the "
                 "actual TPNODL bill to reconcile them."),
    }


# ----------------------------------------------------------------- actual bill
ACTUAL_FIELDS = (
    "consumer_ac", "bill_no", "contract_demand_kva", "billable_demand_kva", "power_factor",
    "load_factor_pct", "kwh_total", "kvah_total", "energy_charge", "demand_charge",
    "tod_charge", "pf_charge", "electricity_duty", "dps", "net_payable",
)


def get_actual(db: Session, month: str) -> dict | None:
    row = db.execute(text("SELECT * FROM pems_bill_actual WHERE bill_month=:m"),
                     {"m": month}).mappings().first()
    if not row:
        return None
    out = {}
    for k, v in dict(row).items():
        if hasattr(v, "__float__") and not isinstance(v, (int, bool)):
            out[k] = float(v)
        elif isinstance(v, (dict, list)):
            out[k] = v
        else:
            out[k] = v
    return out


def save_actual(db: Session, month: str, data: dict) -> dict:
    cols = {k: data.get(k) for k in ACTUAL_FIELDS if k in data}
    cols["bill_month"] = month
    keys = list(cols.keys())
    placeholders = ", ".join(f":{k}" for k in keys)
    updates = ", ".join(f"{k}=EXCLUDED.{k}" for k in keys if k != "bill_month")
    db.execute(text(
        f"INSERT INTO pems_bill_actual ({', '.join(keys)}) VALUES ({placeholders}) "
        f"ON CONFLICT (bill_month) DO UPDATE SET {updates}"), cols)
    db.commit()
    return compute(db, month)

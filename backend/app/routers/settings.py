"""System-settings endpoints: date-effective constants and tariff versions."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import settings as svc

router = APIRouter(prefix="/settings", tags=["settings"])


# ------------------------------------------------------------------ constants
@router.get("/constants")
def get_constants(db: Session = Depends(get_db)) -> list[dict]:
    return svc.list_constants(db)


@router.put("/constants")
def put_constant(body: dict = Body(...), db: Session = Depends(get_db)) -> list[dict]:
    try:
        return svc.upsert_constant(
            db,
            ckey=body["ckey"], label=body["label"], category=body.get("category", "General"),
            unit=body.get("unit"), cvalue=float(body["cvalue"]),
            effective_from=body["effective_from"], note=body.get("note"),
            updated_by=body.get("updated_by") or "web",
        )
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid constant payload: {e}")


@router.delete("/constants/{cid}")
def delete_constant(cid: int, by: str | None = Query(None), db: Session = Depends(get_db)) -> list[dict]:
    return svc.delete_constant(db, cid, by=by)


# ------------------------------------------------------- per-meter factors
@router.get("/meter-factors")
def get_meter_factors(db: Session = Depends(get_db)) -> dict:
    return svc.list_meter_factors(db)


@router.put("/meter-factors")
def put_meter_factor(body: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    try:
        return svc.upsert_meter_factor(
            db, device_id=body["device_id"], feeder_id=int(body["feeder_id"]),
            mult_factor=float(body["mult_factor"]), effective_from=body["effective_from"],
            note=body.get("note"), by=body.get("updated_by"))
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid meter-factor payload: {e}")


@router.delete("/meter-factors/{device_id}/{feeder_id}")
def delete_meter_factor(device_id: str, feeder_id: int, effective_from: str = Query(...),
                        by: str | None = Query(None), db: Session = Depends(get_db)) -> dict:
    return svc.delete_meter_factor(db, device_id, feeder_id, effective_from, by=by)


# -------------------------------------------------------------------- tariffs
@router.get("/tariffs")
def get_tariffs(db: Session = Depends(get_db)) -> list[dict]:
    return svc.list_tariffs(db)


@router.put("/tariffs")
def put_tariff(body: dict = Body(...), db: Session = Depends(get_db)) -> list[dict]:
    if not body.get("effective_from"):
        raise HTTPException(400, "effective_from is required")
    return svc.upsert_tariff(db, body, by=body.get("updated_by"))


# --------------------------------------------------------------- system config
@router.get("/system")
def get_system(db: Session = Depends(get_db)) -> list[dict]:
    return svc.get_system_config(db)


@router.put("/system")
def put_system(body: dict = Body(...), db: Session = Depends(get_db)) -> list[dict]:
    try:
        return svc.set_system_config(db, body["cfg_key"], body["cfg_value"], by=body.get("updated_by"))
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid system config payload: {e}")


# ----------------------------------------------------------------- audit trail
@router.get("/audit")
def audit(limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> list[dict]:
    return svc.list_audit(db, limit)


# --------------------------------------------------------- effective snapshot
@router.get("/effective")
def effective(day: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
              db: Session = Depends(get_db)) -> dict:
    """The values actually in force on a given date — what the engines will use."""
    from datetime import datetime
    d = datetime.strptime(day, "%Y-%m-%d").date()
    keys = ("meter_mult_factor", "contract_demand_kva", "mmfc_floor_pct",
            "tod_peak_adder", "tod_solar_incentive")
    return {"day": day, "constants": {k: svc.const_val(db, k, d) for k in keys}}

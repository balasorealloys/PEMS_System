"""Module 1 — Energy Monitoring ("Complete View") endpoints."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import energy

router = APIRouter(prefix="/live", tags=["monitoring"])


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict:
    """Latest plant-wide load snapshot."""
    return energy.plant_overview(db)


@router.get("/feeders")
def feeders(db: Session = Depends(get_db)) -> list[dict]:
    """Feeder master (enabled feeders with device/location)."""
    return energy.list_feeders(db)


@router.get("/feeder-energy")
def feeder_energy(
    device_id: str = Query(..., examples=["DI1001"]),
    feeder_id: int = Query(..., examples=[21]),
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    """Energy (kWh/kVAh) for one feeder over [start, end)."""
    return energy.feeder_energy(db, device_id, feeder_id, start, end)

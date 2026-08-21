"""Tariff / rate engine endpoints (FTD / MTD / YTD)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import rate

router = APIRouter(prefix="/rate", tags=["rate"])


@router.get("/compute")
def compute(day: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
            level: str = Query("mtd", pattern="^(ftd|mtd|ytd)$"),
            db: Session = Depends(get_db)) -> dict:
    return rate.compute(db, day, level)


@router.get("/all")
def all_levels(day: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
               db: Session = Depends(get_db)) -> dict:
    return {lvl: rate.compute(db, day, lvl) for lvl in ("ftd", "mtd", "ytd")}


@router.get("/fy-months")
def fy_months(start: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
              end: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
              db: Session = Depends(get_db)) -> dict:
    """Full-FY month-by-month rollup (with load & power factor) for the FY(s) the range touches."""
    return rate.fy_months(db, start, end)

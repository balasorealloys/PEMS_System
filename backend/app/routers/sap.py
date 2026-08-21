"""Module 3 — SAP Posting endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import sap

router = APIRouter(prefix="/sap", tags=["sap-posting"])
_DATE = r"^\d{4}-\d{2}-\d{2}$"


class SapConfigIn(BaseModel):
    user: str | None = None
    password: str | None = None          # write-only; only saved when non-empty
    odata_base: str | None = None
    odata_service: str | None = None
    client: str | None = None            # SAP logon client (e.g. "100")
    verify_ssl: bool | None = None       # verify TLS cert (off for self-signed on-prem SAP)
    costcenters: list[str] | None = None  # selected cost centers to post (empty = all)


@router.get("/config")
def get_config(db: Session = Depends(get_db)) -> dict:
    return sap.get_config(db)


@router.put("/config")
def save_config(body: SapConfigIn, db: Session = Depends(get_db)) -> dict:
    return sap.save_config(db, body.model_dump(exclude_none=True))


@router.post("/test")
def test_connection(body: SapConfigIn | None = None, db: Session = Depends(get_db)) -> dict:
    return sap.test_connection(db, body.model_dump(exclude_none=True) if body else None)


@router.get("/costcenters")
def costcenters(db: Session = Depends(get_db)) -> list[dict]:
    return sap.list_costcenters(db)


@router.get("/history")
def history(limit: int = 90, db: Session = Depends(get_db)) -> list[dict]:
    return sap.history(db, limit)


@router.get("/preview")
def preview(posting_date: str = Query(..., pattern=_DATE),
            unit_rate: float | None = None, db: Session = Depends(get_db)) -> dict:
    return sap.preview(db, posting_date, unit_rate)


@router.get("/status")
def status(posting_date: str = Query(..., pattern=_DATE), db: Session = Depends(get_db)) -> list[dict]:
    return sap.status(db, posting_date)


@router.post("/stage")
def stage(posting_date: str = Query(..., pattern=_DATE),
          unit_rate: float | None = None, db: Session = Depends(get_db)) -> dict:
    return sap.stage(db, posting_date, unit_rate)


@router.post("/post")
def post(posting_date: str = Query(..., pattern=_DATE),
         by: str | None = None, force: bool = False, db: Session = Depends(get_db)) -> dict:
    return sap.post_to_sap(db, posting_date, by, force)


# --- multi-day (range) posting ---------------------------------------------------
@router.get("/preview_range")
def preview_range(start: str = Query(..., pattern=_DATE), end: str = Query(..., pattern=_DATE),
                  unit_rate: float | None = None, db: Session = Depends(get_db)) -> dict:
    return sap.preview_range(db, start, end, unit_rate)


@router.post("/stage_range")
def stage_range(start: str = Query(..., pattern=_DATE), end: str = Query(..., pattern=_DATE),
                unit_rate: float | None = None, db: Session = Depends(get_db)) -> dict:
    return sap.stage_range(db, start, end, unit_rate)


@router.post("/post_range")
def post_range(start: str = Query(..., pattern=_DATE), end: str = Query(..., pattern=_DATE),
               by: str | None = None, force: bool = False, db: Session = Depends(get_db)) -> dict:
    return sap.post_range(db, start, end, by, force)

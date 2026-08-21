"""Module 4 — Bill Reconciliation endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import recon

router = APIRouter(prefix="/recon", tags=["bill-reconciliation"])


@router.get("/compute")
def compute(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
            db: Session = Depends(get_db)) -> dict:
    return recon.compute(db, month)


@router.get("/actual")
def get_actual(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
               db: Session = Depends(get_db)) -> dict | None:
    return recon.get_actual(db, month)


@router.put("/actual")
def put_actual(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
               body: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    return recon.save_actual(db, month, body)

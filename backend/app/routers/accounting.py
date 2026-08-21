"""Module 2 — Energy Accounting endpoints."""
from __future__ import annotations

import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import accounting
from app.services.report_xlsx import energy_master_xlsx

router = APIRouter(prefix="/accounting", tags=["accounting"])


@router.get("/months")
def months(db: Session = Depends(get_db)) -> list[str]:
    return accounting.available_months(db)


@router.get("/balance")
def balance(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
            db: Session = Depends(get_db)) -> dict:
    return accounting.monthly_balance(db, month)


@router.get("/report.xlsx")
def report_xlsx(month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
                db: Session = Depends(get_db)):
    data = accounting.monthly_balance(db, month, persist=False)
    wb = energy_master_xlsx(data)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Energy_Master_{month}.xlsx"'},
    )

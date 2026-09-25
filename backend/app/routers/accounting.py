"""Module 2 — Energy Accounting endpoints."""
from __future__ import annotations

import io
from calendar import monthrange

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import accounting, rate
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
    # attach the incomer bill's load-factor slab split so the export itemises the
    # energy charge (Slab 1 ≤ threshold LF, Slab 2 excess) like the TPNODL bill
    try:
        y, m = int(month[:4]), int(month[5:7])
        day = f"{month}-{monthrange(y, m)[1]:02d}"
        data["energy_slabs"] = rate.compute(db, day, "mtd").get("energy_slabs")
    except Exception:
        data["energy_slabs"] = None
    wb = energy_master_xlsx(data)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Energy_Master_{month}.xlsx"'},
    )

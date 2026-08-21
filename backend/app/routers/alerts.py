"""Real-time alerts endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import alerts

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(db: Session = Depends(get_db)) -> dict:
    return alerts.compute(db)

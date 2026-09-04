"""Executive dashboard endpoint (Module 1 — Energy Monitoring landing)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/executive")
def executive(
    start: str | None = Query(None), end: str | None = Query(None),
    db: Session = Depends(get_db),
) -> dict:
    return dashboard.executive(db, start, end)

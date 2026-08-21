"""Module: Feeder Mapping — master-data management (meter -> load -> cost center)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import mapping

router = APIRouter(prefix="/mapping", tags=["feeder-mapping"])


class MappingIn(BaseModel):
    load_id: int
    device_id: str
    feeder_id: int
    sign: int = Field(1, description="+1 add, -1 subtract (for derived loads)")
    notes: str | None = None


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)) -> dict:
    return mapping.summary(db)


@router.get("/tree")
def tree(db: Session = Depends(get_db)) -> dict:
    return mapping.mapping_tree(db)


@router.get("/sld")
def sld(db: Session = Depends(get_db)) -> dict:
    return mapping.sld_tree(db)


@router.get("/cost-centers")
def cost_centers(db: Session = Depends(get_db)) -> list[dict]:
    return mapping.list_cost_centers(db)


@router.get("/loads")
def loads(db: Session = Depends(get_db)) -> list[dict]:
    return mapping.list_loads(db)


@router.get("/meters")
def meters(
    only: str | None = Query(None, pattern="^(unmapped|unconfirmed|mapped)$"),
    section: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    return mapping.list_meters(db, only=only, section=section, search=search)


@router.post("/")
def create_or_update(body: MappingIn, db: Session = Depends(get_db)) -> dict:
    return mapping.upsert_mapping(
        db, load_id=body.load_id, device_id=body.device_id, feeder_id=body.feeder_id,
        sign=body.sign, notes=body.notes,
    )


@router.post("/{map_id}/confirm")
def confirm(map_id: int, db: Session = Depends(get_db)) -> dict:
    return mapping.confirm_mapping(db, map_id)


@router.post("/confirm-all")
def confirm_all(min_score: float = 0.0, db: Session = Depends(get_db)) -> dict:
    return mapping.confirm_all(db, min_score=min_score)


@router.delete("/{map_id}")
def delete(map_id: int, db: Session = Depends(get_db)) -> dict:
    return mapping.delete_mapping(db, map_id)

"""User role management endpoints (admin only — enforced by middleware)."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import roles

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("")
def list_roles(db: Session = Depends(get_db)) -> list[dict]:
    return roles.list_roles(db)


@router.get("/employees")
def search_employees(q: str = Query(""), db: Session = Depends(get_db)) -> list[dict]:
    return roles.search_employees(db, q)


@router.put("")
def set_role(request: Request, body: dict = Body(...), db: Session = Depends(get_db)) -> list[dict]:
    try:
        by = getattr(request.state, "emp_id", None)
        return roles.set_role(db, str(body["emp_id"]), str(body["role"]), by=by)
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"Invalid role payload: {e}")


@router.delete("/{emp_id}")
def delete_role(emp_id: str, db: Session = Depends(get_db)) -> list[dict]:
    return roles.delete_role(db, emp_id)

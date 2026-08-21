"""Authentication + activity-tracking endpoints (intranet SSO)."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.db import get_auth_db
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "pems_session"
MAX_AGE = auth.IDLE_HOURS * 3600


@router.post("/login")
def login(response: Response, request: Request, body: dict = Body(...),
          db: Session = Depends(get_auth_db)) -> dict:
    empid = (body.get("empid") or "").strip()
    password = body.get("password") or ""
    if not empid or not password:
        raise HTTPException(400, "EMPID and password are required.")
    emp = auth.authenticate(db, empid, password)
    if not emp:
        raise HTTPException(401, "Invalid EMPID or password.")
    sid = auth.create_session(db, emp, request.client.host if request.client else None,
                              request.headers.get("user-agent"))
    response.set_cookie(COOKIE, sid, httponly=True, samesite="lax", max_age=MAX_AGE, path="/")
    return {"user": emp}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_auth_db)) -> dict:
    s = auth.get_session(db, request.cookies.get(COOKIE))
    if not s:
        raise HTTPException(401, "Not authenticated.")
    return {"user": auth.employee(db, s["emp_id"])}


@router.post("/logout")
def logout(response: Response, request: Request, db: Session = Depends(get_auth_db)) -> dict:
    sid = request.cookies.get(COOKIE)
    if sid:
        auth.end_session(db, sid, "LOGOUT")
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.post("/track")
def track(request: Request, body: dict = Body(...), db: Session = Depends(get_auth_db)) -> dict:
    sid = request.cookies.get(COOKIE)
    s = auth.get_session(db, sid)
    if not s:
        raise HTTPException(401, "Not authenticated.")
    auth.record_page_view(db, sid, s["emp_id"], body.get("path", "/"),
                          body.get("time_spent"), body.get("referrer"))
    return {"ok": True}


@router.post("/heartbeat")
def heartbeat(request: Request, db: Session = Depends(get_auth_db)) -> dict:
    sid = request.cookies.get(COOKIE)
    if sid:
        auth.touch(db, sid)
    return {"ok": True}

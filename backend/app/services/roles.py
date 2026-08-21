"""PEMS role management (admin-only): grant/revoke access roles per employee.

pems_user_role lives in the PRIMARY (Postgres) database; the employee directory
(sap_employee_details) lives in the AUTH (MySQL) database. Those can no longer be
joined in one SQL statement, so the two are queried separately and merged in Python.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import AuthSessionLocal
from app.services.auth import EMP_TBL, ROLE_RANK

ROLES = ("admin", "manager", "viewer")
_ROLE_ORDER = "CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END"


def _employees(emp_ids: list[str]) -> dict[str, dict]:
    """Directory rows for the given EMPIDs, from the auth (MySQL) database."""
    if not emp_ids:
        return {}
    with AuthSessionLocal() as adb:
        rows = adb.execute(text(
            f"SELECT EMPID, EMPNAME, EMPDESG, EMPDEPT FROM {EMP_TBL} WHERE EMPID IN :ids")
            .bindparams(__import__("sqlalchemy").bindparam("ids", expanding=True)),
            {"ids": emp_ids}).mappings().all()
    return {str(r["EMPID"]): r for r in rows}


def list_roles(db: Session) -> list[dict]:
    """Assigned roles (Postgres), joined to the employee directory (MySQL) in Python."""
    rows = db.execute(text(
        f"SELECT emp_id, role, granted_by, updated_at FROM pems_user_role "
        f"ORDER BY {_ROLE_ORDER}, emp_id")).mappings().all()
    emps = _employees([str(r["emp_id"]) for r in rows])
    out = []
    for r in rows:
        e = emps.get(str(r["emp_id"]), {})
        out.append({
            "emp_id": r["emp_id"], "role": r["role"],
            "name": ((e.get("EMPNAME") or r["emp_id"]) or "").strip() or r["emp_id"],
            "designation": (e.get("EMPDESG") or "").strip() or None,
            "department": (e.get("EMPDEPT") or "").strip() or None,
            "granted_by": r["granted_by"],
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return out


def set_role(db: Session, emp_id: str, role: str, by: str | None) -> list[dict]:
    if role not in ROLE_RANK:
        raise ValueError(f"invalid role '{role}'")
    db.execute(text(
        "INSERT INTO pems_user_role (emp_id, role, granted_by) VALUES (:e,:r,:by) "
        "ON CONFLICT (emp_id) DO UPDATE SET role=EXCLUDED.role, granted_by=EXCLUDED.granted_by"),
        {"e": emp_id, "r": role, "by": by})
    db.commit()
    return list_roles(db)


def delete_role(db: Session, emp_id: str) -> list[dict]:
    """Remove an explicit role → the user reverts to the default 'viewer'."""
    db.execute(text("DELETE FROM pems_user_role WHERE emp_id=:e"), {"e": emp_id})
    db.commit()
    return list_roles(db)


def search_employees(db: Session, q: str, limit: int = 15) -> list[dict]:
    """Employee lookup for the role-grant picker (by name or EMPID) — auth/MySQL DB."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    with AuthSessionLocal() as adb:
        rows = adb.execute(text(
            f"""SELECT EMPID, EMPNAME, EMPDESG, EMPDEPT FROM {EMP_TBL}
                WHERE EMPNAME LIKE :like OR EMPID LIKE :like
                ORDER BY EMPNAME LIMIT :n"""),
            {"like": f"%{q}%", "n": limit}).mappings().all()
    return [{"emp_id": r["EMPID"], "name": (r["EMPNAME"] or r["EMPID"]).strip(),
             "designation": (r["EMPDESG"] or "").strip() or None,
             "department": (r["EMPDEPT"] or "").strip() or None} for r in rows]

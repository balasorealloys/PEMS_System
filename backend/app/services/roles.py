"""PEMS role management (admin-only): grant/revoke access roles per employee.

Both pems_user_role and the employee directory (sap_odata_api.sap_employee_details)
now live in the same Postgres database, so the directory lookup uses the caller's
primary session — no separate auth engine anymore.
"""
from __future__ import annotations

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.services.auth import EMP_TBL, ROLE_RANK

ROLES = ("admin", "manager", "viewer")
_ROLE_ORDER = "CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END"


def _employees(db: Session, emp_ids: list[str]) -> dict[str, dict]:
    """Directory rows for the given EMPIDs, from the Postgres employee table."""
    if not emp_ids:
        return {}
    rows = db.execute(text(
        f"SELECT empid, empname, empdesg, empdept FROM {EMP_TBL} WHERE empid IN :ids")
        .bindparams(bindparam("ids", expanding=True)),
        {"ids": emp_ids}).mappings().all()
    return {str(r["empid"]): r for r in rows}


def list_roles(db: Session) -> list[dict]:
    """Assigned roles joined to the employee directory (both in Postgres), merged here."""
    rows = db.execute(text(
        f"SELECT emp_id, role, granted_by, updated_at FROM pems_user_role "
        f"ORDER BY {_ROLE_ORDER}, emp_id")).mappings().all()
    emps = _employees(db, [str(r["emp_id"]) for r in rows])
    out = []
    for r in rows:
        e = emps.get(str(r["emp_id"]), {})
        out.append({
            "emp_id": r["emp_id"], "role": r["role"],
            "name": ((e.get("empname") or r["emp_id"]) or "").strip() or r["emp_id"],
            "designation": (e.get("empdesg") or "").strip() or None,
            "department": (e.get("empdept") or "").strip() or None,
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
    """Employee lookup for the role-grant picker (by name or EMPID) — Postgres directory."""
    q = (q or "").strip()
    if len(q) < 2:
        return []
    rows = db.execute(text(
        f"""SELECT empid, empname, empdesg, empdept FROM {EMP_TBL}
            WHERE empname ILIKE :like OR empid LIKE :like
            ORDER BY empname LIMIT :n"""),
        {"like": f"%{q}%", "n": limit}).mappings().all()
    return [{"emp_id": r["empid"], "name": (r["empname"] or r["empid"]).strip(),
             "designation": (r["empdesg"] or "").strip() or None,
             "department": (r["empdept"] or "").strip() or None} for r in rows]

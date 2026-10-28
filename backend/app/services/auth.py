"""Authentication + activity tracking against the intranet tables.

Single sign-on with the existing intranet credentials. These tables now live in the
PRIMARY Postgres database (the corporate balcorpdb was consolidated into Postgres),
so auth uses the same engine as the rest of PEMS — there is no separate MySQL anymore:
  * balcorpdb.intranet_user_login       — empid + SHA-1(user_pwd), status='A' active
  * sap_odata_api.sap_employee_details  — name / designation / department / email
  * balcorpdb.digital_apps_user_sessions — one row per PEMS login (app_source='PEMS')
  * balcorpdb.digital_apps_page_views    — one row per page view

Postgres folds unquoted identifiers to lowercase, so result keys come back lowercase
(empid, user_pwd, …) — accessed as such below.

Passwords are never stored or logged by PEMS — we only compare the SHA-1 hash of
what the user types to the hash already held in intranet_user_login.
"""
from __future__ import annotations

import hashlib
import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

LOGIN_TBL = "balcorpdb.intranet_user_login"
EMP_TBL = "sap_odata_api.sap_employee_details"
SESS_TBL = "balcorpdb.digital_apps_user_sessions"
VIEW_TBL = "balcorpdb.digital_apps_page_views"
APP_SOURCE = "PEMS"
IDLE_HOURS = 8                     # session expires after this many idle hours


def _sha1(pw: str) -> str:
    return hashlib.sha1(pw.encode("utf-8")).hexdigest()


ROLE_RANK = {"viewer": 1, "manager": 2, "admin": 3}
DEFAULT_ROLE = "viewer"


def pems_role(emp_id: str) -> str:
    """The PEMS access role for an employee (default 'viewer' if not assigned).

    pems_user_role lives in the PRIMARY (Postgres) database, not the auth/MySQL one,
    so this opens its own primary session regardless of the caller's engine.
    """
    from app.db import SessionLocal  # local import avoids a config/db import cycle
    with SessionLocal() as pdb:
        r = pdb.execute(text("SELECT role FROM pems_user_role WHERE emp_id=:e"), {"e": emp_id}).scalar()
    return r if r in ROLE_RANK else DEFAULT_ROLE


def has_role(emp_id: str, minimum: str) -> bool:
    return ROLE_RANK.get(pems_role(emp_id), 0) >= ROLE_RANK.get(minimum, 99)


# --------------------------------------------------------------- authentication
def authenticate(db: Session, empid: str, password: str) -> dict | None:
    """Validate EMPID + password against the intranet login table. Returns the
    employee profile on success, else None. Assumes USER_PWD = SHA-1(password)."""
    row = db.execute(text(
        f"SELECT empid, user_pwd, status FROM {LOGIN_TBL} WHERE empid = :e"),
        {"e": empid}).mappings().first()
    if not row or (row["status"] or "").upper() != "A":
        return None
    if (row["user_pwd"] or "").lower() != _sha1(password).lower():
        return None
    return employee(db, empid)


def employee(db: Session, empid: str) -> dict:
    e = db.execute(text(
        f"""SELECT empid, empname, title, empdesg, empdept, emailid, location, cost_center
            FROM {EMP_TBL} WHERE empid = :e"""), {"e": empid}).mappings().first()
    if not e:
        return {"emp_id": empid, "name": empid, "role": None, "department": None,
                "email": None, "title": None, "location": None, "plant": None,
                "cost_center": None, "pems_role": pems_role(empid)}
    s = lambda v: (v or "").strip() or None  # noqa: E731
    return {
        "emp_id": e["empid"], "name": s(e["empname"]) or empid, "title": s(e["title"]),
        "role": s(e["empdesg"]), "department": s(e["empdept"]), "email": s(e["emailid"]),
        "location": s(e["location"]), "plant": None,  # PG directory has no plant code
        "cost_center": s(e["cost_center"]),
        "pems_role": pems_role(e["empid"]),   # access role within PEMS (Postgres)
    }


# --------------------------------------------------------------------- sessions
def _ua_parse(ua: str) -> tuple[str, str, str]:
    ua = ua or ""
    browser = ("Edge" if "Edg" in ua else "Chrome" if "Chrome" in ua else "Firefox" if "Firefox" in ua
               else "Safari" if "Safari" in ua else "Other")
    os_ = ("Windows" if "Windows" in ua else "Android" if "Android" in ua
           else "iOS" if ("iPhone" in ua or "iPad" in ua) else "macOS" if "Mac OS" in ua
           else "Linux" if "Linux" in ua else "Other")
    device = "Mobile" if ("Mobile" in ua or "Android" in ua) else "Desktop"
    return browser, os_, device


def create_session(db: Session, emp: dict, ip: str | None, ua: str | None) -> str:
    sid = secrets.token_hex(32)   # 64-char session id
    browser, os_, device = _ua_parse(ua or "")
    db.execute(text(
        f"""INSERT INTO {SESS_TBL}
              (session_id, emp_id, emp_name, role, department, login_at, last_active_at,
               is_active, app_source, ip_address, user_agent, device_type, browser, os)
            VALUES (:sid,:eid,:nm,:role,:dept, NOW(), NOW(), 1, :app, :ip, :ua, :dev, :br, :os)"""),
        {"sid": sid, "eid": emp["emp_id"], "nm": emp["name"], "role": emp.get("role"),
         "dept": emp.get("department"), "app": APP_SOURCE, "ip": ip, "ua": (ua or "")[:500],
         "dev": device, "br": browser, "os": os_})
    db.commit()
    return sid


def get_session(db: Session, sid: str | None) -> dict | None:
    """The active, non-idle session for a session id, or None."""
    if not sid:
        return None
    row = db.execute(text(
        f"""SELECT session_id, emp_id, emp_name, role, department, last_active_at
            FROM {SESS_TBL}
            WHERE session_id = :sid AND is_active = 1
              AND last_active_at > (NOW() - INTERVAL '{IDLE_HOURS} hours')"""),
        {"sid": sid}).mappings().first()
    return dict(row) if row else None


def touch(db: Session, sid: str) -> None:
    db.execute(text(f"UPDATE {SESS_TBL} SET last_active_at = NOW() WHERE session_id = :sid AND is_active = 1"),
               {"sid": sid})
    db.commit()


def end_session(db: Session, sid: str, reason: str = "LOGOUT") -> None:
    # duration_minutes is a generated column — the DB fills it from login/logout.
    db.execute(text(
        f"""UPDATE {SESS_TBL}
            SET is_active = 0, logout_at = NOW(), end_reason = :r
            WHERE session_id = :sid AND is_active = 1"""), {"sid": sid, "r": reason})
    db.commit()


def record_page_view(db: Session, sid: str, emp_id: str, path: str,
                     time_spent: int | None = None, referrer: str | None = None) -> None:
    db.execute(text(
        f"""INSERT INTO {VIEW_TBL}
              (session_id, emp_id, page_path, app_source, referrer_path, viewed_at, time_spent_seconds)
            VALUES (:sid,:eid,:p,:app,:ref, NOW(), :ts)"""),
        {"sid": sid, "eid": emp_id, "p": (path or "/")[:255], "app": APP_SOURCE,
         "ref": (referrer or None), "ts": time_spent})
    db.execute(text(f"UPDATE {SESS_TBL} SET last_active_at = NOW() WHERE session_id = :sid AND is_active = 1"),
               {"sid": sid})
    db.commit()

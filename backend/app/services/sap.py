"""Module 3 — SAP Posting.

Computes daily per-cost-center energy cost and posts it to SAP via the ZPM OData service.
Postings are staged in pems_sap_posting with a status machine; the real OData POST only
runs when SAP credentials are configured (it is never triggered automatically).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

import httpx
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.services import accounting, rate as rate_engine, vault

settings = get_settings()

DEFAULT_RATE_KEY = "sap_default_unit_rate"   # Rs/kWh
CFG_PREFIX = "sap."                          # pems_config keys: sap.user, sap.pass, ...


def _json_text(s: str) -> str:
    """Always-valid JSON text for a JSONB column (SAP may reply with non-JSON on error)."""
    s = s or ""
    try:
        json.loads(s)
        return s
    except Exception:  # noqa: BLE001
        return json.dumps(s)


# --- configuration stored in pems_config (falls back to env settings) ------------
def _cfg(db: Session) -> dict:
    return {r[0][len(CFG_PREFIX):]: r[1] for r in db.execute(
        text("SELECT cfg_key, cfg_value FROM pems_config WHERE cfg_key LIKE 'sap.%'")).all()}


def _selected_ccs(db: Session) -> set[str]:
    raw = _cfg(db).get("costcenters")
    try:
        return set(json.loads(raw)) if raw else set()
    except Exception:  # noqa: BLE001
        return set()


def _verify_ssl(db: Session) -> bool:
    # Off by default — on-prem SAP typically uses a self-signed certificate.
    return (_cfg(db).get("verify_ssl") or "false").lower() == "true"


def _sap_request(method: str, url: str, auth: tuple[str, str], verify: bool, **kw) -> httpx.Response:
    """Follow redirects while RE-APPLYING auth on every hop. SAP redirects
    http→https (a different origin), and httpx drops the Authorization header
    across that boundary — which SAP then answers with 401 even for valid
    credentials. Re-issuing each request with auth keeps the login attached."""
    timeout = kw.pop("timeout", 30)
    with httpx.Client(verify=verify, timeout=timeout) as client:
        r = client.request(method, url, auth=auth, **kw)
        hops = 0
        while r.is_redirect and r.headers.get("location") and hops < 5:
            r = client.request(method, r.headers["location"], auth=auth, **kw)
            hops += 1
        return r


def _creds(db: Session) -> tuple[str, str, str, str, str]:
    c = _cfg(db)
    stored_pw = c.get("pass")
    pw = vault.decrypt(stored_pw) if stored_pw else settings.sap_pass
    return (c.get("user") or settings.sap_user, pw,
            c.get("odata_base") or settings.sap_odata_base,
            c.get("odata_service") or settings.sap_odata_service,
            c.get("client") or "")


def get_config(db: Session) -> dict:
    """Public config (password is never returned — only whether one is set)."""
    c = _cfg(db)
    user = c.get("user") or settings.sap_user or ""
    base = c.get("odata_base") or settings.sap_odata_base or ""
    svc = c.get("odata_service") or settings.sap_odata_service or ""
    client = c.get("client") or ""
    has_pw = bool(c.get("pass") or settings.sap_pass)
    try:
        ccs = json.loads(c.get("costcenters") or "[]")
    except Exception:  # noqa: BLE001
        ccs = []
    return {"user": user, "odata_base": base, "odata_service": svc, "client": client,
            "verify_ssl": (c.get("verify_ssl") or "false").lower() == "true",
            "has_password": has_pw, "costcenters": ccs,
            "configured": bool(user and has_pw and base)}


def save_config(db: Session, data: dict) -> dict:
    def setk(k: str, v: str, dt: str = "string") -> None:
        db.execute(text(
            "INSERT INTO pems_config (cfg_key, cfg_value, data_type) VALUES (:k,:v,:dt) "
            "ON CONFLICT (cfg_key) DO UPDATE SET cfg_value=EXCLUDED.cfg_value, data_type=EXCLUDED.data_type"),
            {"k": CFG_PREFIX + k, "v": v, "dt": dt})
    if "user" in data: setk("user", data.get("user") or "")
    if "odata_base" in data: setk("odata_base", data.get("odata_base") or "")
    if "odata_service" in data: setk("odata_service", data.get("odata_service") or "")
    if "client" in data: setk("client", data.get("client") or "")
    if "verify_ssl" in data: setk("verify_ssl", "true" if data.get("verify_ssl") else "false", "bool")
    if data.get("password"):  # only overwrite the password when a new one is supplied
        setk("pass", vault.encrypt(data["password"]))   # encrypted at rest
    if "costcenters" in data:
        setk("costcenters", json.dumps(data.get("costcenters") or []), "json")
    db.commit()
    return get_config(db)


def test_connection(db: Session, overrides: dict | None = None) -> dict:
    """Probe the SAP OData service ($metadata) with the given/saved credentials.
    Non-destructive — a GET only, never posts anything."""
    o = overrides or {}
    user, pw, base, service, client = _creds(db)
    user = o.get("user") or user
    base = o.get("odata_base") or base
    service = o.get("odata_service") or service
    client = o.get("client") or client
    if o.get("password"):           # test the just-typed password before saving
        pw = o["password"]
    if not (user and pw and base and service):
        return {"ok": False, "message": "Missing user, password, base URL or service."}
    verify = bool(o["verify_ssl"]) if "verify_ssl" in o else _verify_ssl(db)
    url = f"{base}/{service}/$metadata"
    if client:
        url += f"?sap-client={client}"
    try:
        r = _sap_request("GET", url, (user, pw), verify, timeout=20,
                         headers={"Accept": "application/xml"})
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "message": f"Cannot reach SAP: {str(e)[:200]}"}
    if r.status_code < 300:
        return {"ok": True, "status": r.status_code,
                "message": f"Connected — OData service reachable and authenticated (HTTP {r.status_code})."}
    if r.status_code in (401, 403):
        return {"ok": False, "status": r.status_code,
                "message": f"Authentication failed (HTTP {r.status_code}) — check username, password and client."}
    return {"ok": False, "status": r.status_code,
            "message": f"Reachable but SAP returned HTTP {r.status_code}."}


def list_costcenters(db: Session) -> list[dict]:
    return [dict(r) for r in db.execute(text(
        "SELECT sap_costcenter, description, category FROM pems_cost_center "
        "WHERE is_active=true ORDER BY sap_costcenter")).mappings()]


def history(db: Session, limit: int = 90) -> list[dict]:
    rows = db.execute(text(
        """SELECT posting_date, COUNT(*) AS rows_ct,
                  SUM(amount) AS total_amount, SUM(consumption) AS total_kwh,
                  COUNT(*) FILTER (WHERE status='posted') AS posted,
                  COUNT(*) FILTER (WHERE status='pending') AS pending,
                  COUNT(*) FILTER (WHERE status='failed') AS failed,
                  COUNT(*) FILTER (WHERE status='confirmed') AS confirmed,
                  MAX(posted_at) AS last_posted, MAX(posted_by) AS posted_by
           FROM pems_sap_posting GROUP BY posting_date ORDER BY posting_date DESC LIMIT :l"""
    ), {"l": limit}).mappings().all()
    return [dict(r) for r in rows]


# --- multi-day helpers (post one document per day, for a whole range) ------------
MAX_RANGE_DAYS = 92


def _days(start: str, end: str) -> list[str]:
    d, e = datetime.strptime(start, "%Y-%m-%d"), datetime.strptime(end, "%Y-%m-%d")
    out = []
    while d <= e and len(out) < MAX_RANGE_DAYS:
        out.append(d.strftime("%Y-%m-%d")); d += timedelta(days=1)
    return out


def preview_range(db: Session, start: str, end: str, unit_rate: float | None = None) -> dict:
    # Compute the tariff ONCE (as of the range end) and reuse it for every day —
    # a per-day MTD compute over a long range would be very slow.
    rate, source = _rate(db, unit_rate, end)
    days = []
    for day in _days(start, end):
        pv = preview(db, day, rate)   # explicit rate → skips per-day compute
        days.append({"posting_date": day, "rows_ct": len(pv["rows"]),
                     "total_kwh": pv["total_consumption"], "total_amount": pv["total_amount"],
                     "unit_rate": rate, "rate_source": source})
    return {"start": start, "end": end, "unit_rate": rate, "rate_source": source, "days": days,
            "total_amount": round(sum(d["total_amount"] for d in days), 2),
            "total_kwh": round(sum(d["total_kwh"] for d in days), 2)}


def stage_range(db: Session, start: str, end: str, unit_rate: float | None = None) -> dict:
    rate, _ = _rate(db, unit_rate, end)          # once, then pass explicitly per day
    n = sum(stage(db, day, rate)["staged"] for day in _days(start, end))
    return {"staged": n, "days": len(_days(start, end))}


def post_range(db: Session, start: str, end: str, by: str | None = None, force: bool = False) -> dict:
    posted = failed = skipped = 0
    reasons: set[str] = set()
    for day in _days(start, end):
        r = post_to_sap(db, day, by, force)
        posted += r.get("posted", 0)
        failed += r.get("failed", 0)
        skipped += r.get("skipped", 0)
        if r.get("failed") and r.get("reason"):
            reasons.add(r["reason"])
    return {"ok": failed == 0, "posted": posted, "failed": failed, "skipped": skipped,
            "reason": "; ".join(reasons) or None}


def _computed_rate(db: Session, posting_date: str) -> float | None:
    """Blended per-unit tariff rate (MTD) for the posting date, from the rate engine.
    This is the value posted to SAP by default; a manual override can replace it."""
    try:
        r = rate_engine.compute(db, posting_date, "mtd")
        pr = float(r.get("per_unit_rate") or 0)
        return pr if pr > 0 else None
    except Exception:  # noqa: BLE001 — fall back to the configured default
        return None


def _rate(db: Session, override: float | None, posting_date: str | None = None) -> tuple[float, str]:
    """Returns (rate, source). Precedence: manual override → computed tariff → config default."""
    if override is not None:
        return override, "manual"
    if posting_date:
        c = _computed_rate(db, posting_date)
        if c is not None:
            return c, "computed"
    v = db.execute(text("SELECT cfg_value FROM pems_config WHERE cfg_key=:k"),
                   {"k": DEFAULT_RATE_KEY}).scalar()
    return (float(v) if v else 7.0), "default"


def preview(db: Session, posting_date: str, unit_rate: float | None = None) -> dict:
    d = datetime.strptime(posting_date, "%Y-%m-%d")
    energy = accounting.costcenter_energy(db, d, d + timedelta(days=1))
    rate, rate_source = _rate(db, unit_rate, posting_date)
    selected = _selected_ccs(db)   # empty = all cost centers
    rows, total_kwh, total_amt = [], 0.0, 0.0
    for c in energy["cost_centers"]:
        if selected and c["sap_costcenter"] not in selected:
            continue
        kwh = c["kwh"]
        amt = round(kwh * rate, 2)
        total_kwh += kwh; total_amt += amt
        rows.append({
            "posting_date": posting_date, "sap_costcenter": c["sap_costcenter"],
            "costcenter_desc": c["description"], "consumption": round(kwh, 2),
            "unit_rate": rate, "amount": amt, "status": "preview",
        })
    return {"posting_date": posting_date, "unit_rate": rate, "rate_source": rate_source,
            "total_consumption": round(total_kwh, 2), "total_amount": round(total_amt, 2),
            "rows": rows, "source": "KW-integration daily energy x unit rate",
            "hours_of_data": energy["hours"]}


def stage(db: Session, posting_date: str, unit_rate: float | None = None) -> dict:
    """Persist the day's rows to pems_sap_posting as 'pending' (internal only — no SAP call)."""
    pv = preview(db, posting_date, unit_rate)
    for r in pv["rows"]:
        db.execute(text(
            """INSERT INTO pems_sap_posting
                 (posting_date, sap_costcenter, costcenter_desc, consumption, unit_rate, amount, status)
               VALUES (:d,:cc,:desc,:cons,:rate,:amt,'pending')
               ON CONFLICT (posting_date, sap_costcenter) DO UPDATE SET
                 costcenter_desc=EXCLUDED.costcenter_desc, consumption=EXCLUDED.consumption,
                 unit_rate=EXCLUDED.unit_rate, amount=EXCLUDED.amount,
                 status=CASE WHEN pems_sap_posting.status IN ('confirmed','posted')
                             THEN pems_sap_posting.status ELSE 'pending' END"""
        ), {"d": r["posting_date"], "cc": r["sap_costcenter"], "desc": r["costcenter_desc"],
            "cons": r["consumption"], "rate": r["unit_rate"], "amt": r["amount"]})
    db.commit()
    return {"posting_date": posting_date, "staged": len(pv["rows"])}


def status(db: Session, posting_date: str) -> list[dict]:
    return [dict(r) for r in db.execute(text(
        """SELECT posting_date, sap_costcenter, costcenter_desc, consumption, unit_rate, amount,
                  status, sap_doc_no FROM pems_sap_posting
           WHERE posting_date=:d ORDER BY amount DESC"""
    ), {"d": posting_date}).mappings()]


def _csrf_session(client: httpx.Client, base: str, service: str, client_no: str,
                  auth: tuple[str, str]) -> tuple[str, str]:
    """GET the service root with 'x-csrf-token: Fetch' to obtain a CSRF token and a
    session cookie (SAP binds the token to the cookie). Follows the http→https
    redirect manually, re-applying auth + headers. Returns (token, resolved-service-URL);
    cookies are retained on the client for the subsequent POST."""
    hdrs = {"x-csrf-token": "Fetch", "X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
    if client_no:
        hdrs["sap-client"] = client_no
    url = f"{base}/{service}/" + (f"?sap-client={client_no}" if client_no else "")
    try:
        r = client.get(url, auth=auth, headers=hdrs)
        hops = 0
        while r.is_redirect and r.headers.get("location") and hops < 5:
            r = client.get(r.headers["location"], auth=auth, headers=hdrs)
            hops += 1
    except Exception:  # noqa: BLE001
        return "", f"{base}/{service}"
    token = r.headers.get("x-csrf-token", "")     # some systems return it even on 4xx
    resolved = str(r.request.url).split("?", 1)[0].rstrip("/")   # .../<service>
    return token, resolved


def _extract_doc_no(body: str) -> str | None:
    try:
        d = json.loads(body).get("d", {}) or {}
        for k, v in d.items():
            if v and any(t in k.lower() for t in ("docno", "documentno", "belnr", "docnum", "document")):
                return str(v)[:30]
    except Exception:  # noqa: BLE001
        pass
    return None


def post_to_sap(db: Session, posting_date: str, by: str | None = None, force: bool = False) -> dict:
    """Submit staged rows to the SAP OData service. Guarded: requires configured
    credentials; never runs without them. `by` records who triggered the posting.

    Idempotent: by default only 'pending'/'failed' rows are sent — rows already
    'posted' are skipped so a re-run is a no-op. `force=True` also re-sends posted
    rows (the ZPM service upserts by (Postingdate, Costcenter), so this overwrites).

    Uses the SAP CSRF handshake — fetch a token + session cookie, then POST each
    row with the token, cookie and X-Requested-With header (all in one session)."""
    sap_user, sap_pass, sap_base, sap_service, sap_client = _creds(db)
    if not (sap_user and sap_pass and sap_base):
        return {"ok": False, "reason": "SAP credentials not configured — staged only, not posted. "
                "Add them in System Settings → SAP Integration.", "posted": 0}
    wanted = ("pending", "failed", "posted") if force else ("pending", "failed")
    rows = db.execute(text(
        "SELECT id, posting_date, sap_costcenter, costcenter_desc, consumption, unit_rate, amount "
        "FROM pems_sap_posting WHERE posting_date=:d AND status IN :st"
    ).bindparams(bindparam("st", expanding=True)), {"d": posting_date, "st": list(wanted)}).mappings().all()
    if not rows:
        already = db.execute(text("SELECT COUNT(*) FROM pems_sap_posting WHERE posting_date=:d AND status='posted'"),
                             {"d": posting_date}).scalar()
        msg = f"Nothing to post — {already} row(s) already posted." if already else "Nothing staged to post."
        return {"ok": True, "posted": 0, "failed": 0, "skipped": already or 0, "reason": msg}

    verify = _verify_ssl(db)
    auth = (sap_user, sap_pass)
    q = f"?sap-client={sap_client}" if sap_client else ""
    posted, failed = 0, 0

    with httpx.Client(verify=verify, timeout=30, follow_redirects=False) as client:
        token, svc_url = _csrf_session(client, sap_base, sap_service, sap_client, auth)
        post_url = f"{svc_url}/Power_PostSet{q}"
        base_headers = {"Content-Type": "application/json", "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest"}
        if sap_client:
            base_headers["sap-client"] = sap_client

        for r in rows:
            pdate = r["posting_date"]
            pdate_str = (pdate.strftime("%d.%m.%Y") if hasattr(pdate, "strftime")
                         else datetime.strptime(str(pdate)[:10], "%Y-%m-%d").strftime("%d.%m.%Y"))
            # Field formats matched to the QAS-validated ZPM_POWER_CONS sample payload:
            # date DD.MM.YYYY, consumption 3 dp, rate 2 dp, amount 2 dp. Dayamount is the
            # authoritative money value (sent explicitly), so rate stays at display precision.
            payload = {
                "Postingdate": pdate_str,
                "Costcenter": r["sap_costcenter"],
                "Costcentredesc": r["costcenter_desc"],
                "Dayunitconsunption": f'{float(r["consumption"]):.3f}',
                "Dayunitrate": f'{float(r["unit_rate"]):.2f}',
                "Dayamount": f'{float(r["amount"]):.2f}',
            }
            try:
                resp = client.post(post_url, json=payload, auth=auth, headers={**base_headers, "x-csrf-token": token})
                # CSRF token can expire/rotate — refetch once and retry the row
                if resp.status_code == 403 and "csrf" in resp.text.lower():
                    token, svc_url = _csrf_session(client, sap_base, sap_service, sap_client, auth)
                    post_url = f"{svc_url}/Power_PostSet{q}"
                    resp = client.post(post_url, json=payload, auth=auth, headers={**base_headers, "x-csrf-token": token})
                ok = resp.status_code < 300
                db.execute(text(
                    "UPDATE pems_sap_posting SET status=:st, request_json=CAST(:req AS JSONB), "
                    "response_json=CAST(:res AS JSONB), sap_doc_no=:doc, posted_at=:ts, posted_by=:by WHERE id=:id"
                ), {"st": "posted" if ok else "failed", "req": json.dumps(payload),
                    "res": _json_text(resp.text[:2000]), "doc": _extract_doc_no(resp.text) if ok else None,
                    "ts": datetime.now(), "by": by, "id": r["id"]})
                posted += ok
                failed += (not ok)
            except Exception as e:  # noqa: BLE001
                db.execute(text("UPDATE pems_sap_posting SET status='failed', error_msg=:e WHERE id=:id"),
                           {"e": str(e)[:500], "id": r["id"]})
                failed += 1
        db.commit()

    reason = None
    if failed:
        last = db.execute(text("SELECT response_json::text, error_msg FROM pems_sap_posting "
                               "WHERE posting_date=:d AND status='failed' ORDER BY id DESC LIMIT 1"),
                          {"d": posting_date}).first()
        if last:
            reason = (last[1] or (last[0] or ""))[:300]
    return {"ok": failed == 0, "posted": posted, "failed": failed, "reason": reason}

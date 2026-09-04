"""PEMS FastAPI application entrypoint."""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app import __version__
from app.config import get_settings
from app.routers import (accounting, alerts, auth, dashboard, health, live, mapping, rate, recon, roles,
                         sap, settings as settings_router)

settings = get_settings()

# API paths reachable without a session (auth handshake, health, API docs)
_AUTH_EXEMPT = ("/auth/", "/health", "/docs", "/openapi.json", "/redoc")

# Role-gated writes: (path-prefix, minimum role) checked on POST/PUT/DELETE/PATCH.
# GETs stay open to any signed-in user. Prefixes are relative to the API prefix.
_ROLE_WRITE_RULES = (
    ("/settings", "admin"), ("/roles", "admin"),
    ("/sap/post", "manager"), ("/sap/stage", "manager"),
    ("/recon/actual", "manager"), ("/mapping", "manager"),
)
_WRITE_METHODS = {"POST", "PUT", "DELETE", "PATCH"}
_TOUCH_THROTTLE = timedelta(seconds=30)  # skip the session-touch write if done recently

app = FastAPI(
    title="PEMS — Power & Energy Management System",
    description="Energy monitoring, accounting, SAP posting and bill reconciliation "
                "for Balasore Alloys Ltd.",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _check_auth(sid: str | None, method: str, rel_path: str) -> tuple[dict | None, str | None]:
    """Blocking session check + role gate — runs off the event loop (see below).

    Returns (session, role_error). session is None if unauthenticated; role_error is
    the minimum role required if a write route's role check failed.
    """
    from app.db import AuthSessionLocal
    from app.services import auth as auth_svc
    with AuthSessionLocal() as db:   # sessions live in the auth (MySQL) database
        s = auth_svc.get_session(db, sid)
        if not s:
            return None, None
        # keeps activity fresh, but skip the write if it was touched moments ago —
        # a page load fires several API calls in a burst, and each touch is a second
        # round trip to the (WAN) auth database on top of the session check itself.
        last = s.get("last_active_at")
        if last is None or datetime.now() - last > _TOUCH_THROTTLE:
            auth_svc.touch(db, sid)
        if method in _WRITE_METHODS:
            need = next((r for pre, r in _ROLE_WRITE_RULES if rel_path.startswith(pre)), None)
            if need and not auth_svc.has_role(s["emp_id"], need):  # opens its own primary session
                return s, need
        return s, None


@app.middleware("http")
async def require_auth(request: Request, call_next):
    """Gate every /api route behind a valid intranet session, except the auth
    handshake and health/docs. Keeps activity fresh by touching the session.

    The check itself is a blocking DB call (MySQL over the intranet WAN) — run via
    run_in_threadpool so it doesn't stall the single-worker event loop and serialize
    every other in-flight request behind it.
    """
    p = request.url.path
    prefix = settings.api_prefix
    if p.startswith(prefix) and not any(p.startswith(prefix + e) for e in _AUTH_EXEMPT):
        sid = request.cookies.get("pems_session")
        s, role_error = await run_in_threadpool(_check_auth, sid, request.method, p[len(prefix):])
        if not s:
            return JSONResponse({"detail": "Not authenticated."}, status_code=401)
        if role_error:
            return JSONResponse(
                {"detail": f"Requires '{role_error}' role or higher."}, status_code=403)
        request.state.emp_id = s["emp_id"]
    return await call_next(request)


app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(live.router, prefix=settings.api_prefix)
app.include_router(mapping.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(accounting.router, prefix=settings.api_prefix)
app.include_router(sap.router, prefix=settings.api_prefix)
app.include_router(recon.router, prefix=settings.api_prefix)
app.include_router(rate.router, prefix=settings.api_prefix)
app.include_router(settings_router.router, prefix=settings.api_prefix)
app.include_router(alerts.router, prefix=settings.api_prefix)
app.include_router(roles.router, prefix=settings.api_prefix)


# --- keep the 15-min rollup fresh (drives fast reports) ---
@app.on_event("startup")
def _start_rollup_scheduler() -> None:
    try:
        import threading
        from apscheduler.schedulers.background import BackgroundScheduler
        from app.services.rollup import refresh_incremental
        # Catch the rollup up immediately on startup (in a daemon thread so boot isn't
        # blocked). Without this the first refresh only fires 15 min after start, so a
        # server that was down while new meter data arrived shows an empty current month
        # until the first interval elapses.
        threading.Thread(target=refresh_incremental, name="rollup_boot",
                         daemon=True).start()
        sched = BackgroundScheduler(daemon=True)
        sched.add_job(refresh_incremental, "interval", minutes=15, id="rollup_15min",
                      next_run_time=None, max_instances=1, coalesce=True)
        sched.start()
        app.state.scheduler = sched
    except Exception as e:  # noqa: BLE001 — scheduler is best-effort
        print("rollup scheduler not started:", e)


# --- serve the built frontend (single-process production) ---------------------
# In production `npm run build` writes frontend/dist; FastAPI then serves the SPA
# and its assets from the SAME origin as /api, so the session cookie just works
# (no reverse-proxy or CORS needed). In dev, dist is absent and Vite serves :5174.
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="spa")
else:
    @app.get("/")
    def root() -> dict:
        return {"name": "PEMS", "version": __version__, "docs": "/docs",
                "note": "frontend/dist not built — run `npm run build` for production"}


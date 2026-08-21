"""PEMS FastAPI application entrypoint."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

@app.middleware("http")
async def require_auth(request: Request, call_next):
    """Gate every /api route behind a valid intranet session, except the auth
    handshake and health/docs. Keeps activity fresh by touching the session."""
    p = request.url.path
    prefix = settings.api_prefix
    if p.startswith(prefix) and not any(p.startswith(prefix + e) for e in _AUTH_EXEMPT):
        from app.db import AuthSessionLocal
        from app.services import auth as auth_svc
        sid = request.cookies.get("pems_session")
        with AuthSessionLocal() as db:   # sessions live in the auth (MySQL) database
            s = auth_svc.get_session(db, sid)
            if not s:
                return JSONResponse({"detail": "Not authenticated."}, status_code=401)
            auth_svc.touch(db, sid)
            request.state.emp_id = s["emp_id"]
        # role gate on sensitive writes (pems_user_role lives in Postgres; has_role
        # opens its own primary session)
        if request.method in _WRITE_METHODS:
            rel = p[len(prefix):]
            need = next((r for pre, r in _ROLE_WRITE_RULES if rel.startswith(pre)), None)
            if need and not auth_svc.has_role(s["emp_id"], need):
                return JSONResponse(
                    {"detail": f"Requires '{need}' role or higher."}, status_code=403)
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


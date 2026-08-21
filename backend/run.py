"""Production entrypoint — serves the API + built SPA on the host/port from .env.

    cd backend && python run.py

Change the port by editing APP_PORT in the project .env (then restart) — no need
to touch the service command. One worker only: the app runs an internal rollup
scheduler that must not be duplicated across workers.
"""
from __future__ import annotations

import uvicorn

from app.config import get_settings

if __name__ == "__main__":
    s = get_settings()
    print(f"PEMS starting on http://{s.app_host}:{s.app_port}  (env={s.app_env})")
    uvicorn.run("app.main:app", host=s.app_host, port=s.app_port, workers=1, log_level="info")

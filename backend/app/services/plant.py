"""Plant-level identifiers resolved once at import from pems_config.

The main 132 kV grid incomer meter used to be hard-coded as ("DI1001", 21) in
every service. It now comes from the ``main_incomer`` config row so it can be
changed from System Settings (applied on the next restart). Falls back to the
historical default if the row is missing or the DB is unreachable at boot.
"""
from __future__ import annotations

import json

from sqlalchemy import text

_DEFAULT_MAIN = ("DI1001", 21)


def _load_main() -> tuple[str, int]:
    try:
        from app.db import SessionLocal
        with SessionLocal() as db:
            raw = db.execute(text(
                "SELECT cfg_value FROM pems_config WHERE cfg_key='main_incomer'")).scalar()
        if raw:
            j = json.loads(raw)
            return (str(j["device_id"]), int(j["feeder_id"]))
    except Exception:  # noqa: BLE001 — never let config resolution break boot
        pass
    return _DEFAULT_MAIN


MAIN: tuple[str, int] = _load_main()

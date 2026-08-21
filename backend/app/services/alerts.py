"""Real, data-driven alerts.

Every alert here reflects an actual condition in the live plant data or the
operational state (SAP posting, meter coverage) — there is no "everything is fine"
filler. If nothing is wrong, the list is empty and the UI shows no badge.

Severities: critical (needs attention now), warning (risk / watch), info (FYI).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.services import dashboard, sap

# Operational thresholds (sensible defaults; adjust as policy evolves).
DEMAND_WARN_PCT = 90.0     # % of contract demand → watch
DEMAND_CRIT_PCT = 100.0    # % of contract demand → overdrawal
PF_MIN = 0.95              # power factor below this risks a penalty
UNBALANCE_WARN = 5.0       # phase current unbalance %
STALE_MINUTES = 30         # data feed considered stale after this
CONSUMPTION_SPIKE_PCT = 15.0


def compute(db: Session) -> dict:
    alerts: list[dict] = []

    def add(severity: str, source: str, title: str, message: str) -> None:
        alerts.append({"id": f"{source}:{title}", "severity": severity,
                       "source": source, "title": title, "message": message})

    ex = dashboard.executive(db)

    if not ex.get("as_of"):
        add("critical", "data", "No live data", "The plant data feed returned no recent readings.")
    else:
        dem = ex.get("demand") or {}
        u = dem.get("utilization_pct")
        kva, cd = dem.get("kva") or 0, dem.get("contract_kva") or 0
        if u is not None:
            if u >= DEMAND_CRIT_PCT:
                add("critical", "demand", "Demand over contract",
                    f"Max demand {kva/1000:.1f} MVA is {u:.0f}% of the {cd/1000:.0f} MVA contract — overdrawal penalty applies.")
            elif u >= DEMAND_WARN_PCT:
                add("warning", "demand", "Demand approaching contract",
                    f"Max demand at {u:.0f}% of contract ({kva/1000:.1f} MVA).")

        pf = ex.get("power_factor")
        if pf is not None and pf < PF_MIN:
            add("warning", "pf", "Low power factor", f"PF {pf:.3f} is below {PF_MIN:.2f} — penalty risk.")

        pq = ex.get("power_quality") or {}
        ub = pq.get("unbalance_pct")
        if ub is not None and ub > UNBALANCE_WARN:
            add("warning", "power_quality", "Phase unbalance", f"Current unbalance {ub:.1f}% — check phase loading.")

        cons = ex.get("consumption") or {}
        ch = cons.get("change_pct")
        if ch is not None and ch >= CONSUMPTION_SPIKE_PCT:
            add("info", "consumption", "Consumption up", f"Today's energy is {ch:.0f}% above yesterday.")

        st = ex.get("status") or {}
        if st.get("rtus_total") and (st.get("rtus_online") or 0) < st["rtus_total"]:
            add("warning", "rtu", "RTU offline", f"{st.get('rtus_online', 0)}/{st['rtus_total']} RTUs online.")
        if st.get("feeders_total") and (st.get("feeders_online") or 0) < st["feeders_total"]:
            off = st["feeders_total"] - (st.get("feeders_online") or 0)
            add("info", "feeders", "Feeders not reporting", f"{off} of {st['feeders_total']} feeders offline.")

        lu = st.get("last_update")
        if lu:
            try:
                mins = (datetime.now() - datetime.fromisoformat(lu)).total_seconds() / 60
                if mins > STALE_MINUTES:
                    add("critical", "data", "Data feed stale", f"No new meter data for {mins:.0f} minutes.")
            except (ValueError, TypeError):
                pass

    # SAP posting state over the last week
    try:
        hist = sap.history(db, limit=7)
        failed = sum(1 for h in hist if (h.get("failed") or 0) > 0)
        pending = sum(1 for h in hist if (h.get("pending") or 0) > 0 and not (h.get("posted") or 0))
        if failed:
            add("critical", "sap", "SAP posting failed", f"{failed} day(s) in the last week have failed SAP rows.")
        if pending:
            add("info", "sap", "SAP posting pending", f"{pending} day(s) staged but not yet posted to SAP.")
    except Exception:  # noqa: BLE001 — SAP is best-effort here
        pass

    crit = sum(1 for a in alerts if a["severity"] == "critical")
    warn = sum(1 for a in alerts if a["severity"] == "warning")
    info = sum(1 for a in alerts if a["severity"] == "info")
    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: order.get(a["severity"], 3))
    return {"count": len(alerts), "critical": crit, "warning": warn, "info": info,
            "as_of": ex.get("as_of"), "alerts": alerts}

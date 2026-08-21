"""Seed the AUTHORITATIVE mapping from the SLD + EnMS->SAP formula sheet.

Replaces the fuzzy name-match suggestions with the real specification:
  * pems_meter.parent_feeder + sld_costcenter  <- SLD ('sld and cost center.xlsx')
  * pems_load_feeder_map (feeder, coefficient, confirmed=1)  <- SAP formula sheet

Feeder combinations use coefficients: +1 (add), -1 (subtract nested/downstream meter),
0.5 (fractional split, e.g. the RMFS shared 50/50 between Furnace-1 & -2 aux).

Run:  python -m scripts.seed_sld
"""
from __future__ import annotations

import os
import re

import openpyxl
from sqlalchemy import text

from app.db import engine

DOC = r"D:\Projects\PEMS\PEMS doc"

# load_code -> list of (feeder_name_as_in_em_feederinfo, coefficient)
LOAD_FORMULAS: dict[str, list[tuple[str, float]]] = {
    "MRP":          [("MRP", 1)],
    "COLONY":       [("Colony", 1)],
    "GUEST_HOUSE":  [("Rest H( VIP Guest House)", 1)],
    "ADMIN":        [("Admin Bulding -2 (New)", 1), ("Rest H( VIP Guest House)", -1)],
    "CANTEEN":      [("Canteen", 1)],
    "CRANE":        [("Crane", 1)],
    "BRIQUETTING":  [("PDB ( Incomer BAL) L T 6", 1)],
    "COMPRESSOR_1": [("55 KW - GCP Compressor 1", 1)],
    "COMPRESSOR_2": [("55 KW - Compressor 2", 1)],
    "COMPRESSOR_3": [("Compressor 3", 1)],
    "COMPRESSOR_4": [("75 KW- Compressor 4", 1)],
    "PUMPS_CT":     [("MCC 1/1 F-1-2 (Stand By)", 1), ("MCC 2/1 F-1-2 (Working)", 1),
                     ("MCC 3/1 F-3-4 Pump C.T", 1), ("MCC 4-5/F-4-5 Pump C.T", 1)],
    "GCP_1":        [("F-1 GCP", 1)],
    "GCP_2":        [("F-2 GCP", 1)],
    "GCP_3":        [("GCP 3 ID FAN -1", 1), ("GCP 3 ID FAN -2", 1),
                     ("F -3 GCP Axcel Flow Fan", 1)],
    "GCP_4":        [("F-4 GCP", 1)],
    "GCP_5":        [("F-5 GCP", 1)],
    "MAIN_LIGHTING":[("MLDB -250 KVA Trans", 1), ("Colony", -1)],
    "FUR1_AUX":     [("MCC -1/3", 1), ("Furance -1 -2/5 RMFS", 0.5)],
    "FUR2_AUX":     [("MCC -2/3", 1), ("Furance -1 -2/5 RMFS", 0.5)],
    "FUR3_AUX":     [("MCC 3/3", 1), ("F-3 Skip hoist", 1), ("MCC 3/4 F-3 RMHS", 1)],
    "FUR45_AUX":    [("MCC 4/2 -Fur 4 Hy /Blow", 1), ("MCC -5/2 Hy Blowers", 1),
                     ("Furne 4-5 VIB Feeder", 1), ("MCC 4-5/3 -RMHS", 1),
                     ("MCC 4-5/4-RMCS", 1)],
    "FUR-1":        [("Furnace -1", 1)],
    "FUR-2":        [("Furnace -2", 1)],
    "FUR-3":        [("Furnace -3", 1)],
    "FUR-4":        [("Furnace -4", 1)],
    "FUR-5":        [("Furnace -5", 1)],
    # MISC (Miscellaneous + line loss) stays a derived residual (panel remainder) — no
    # direct feeder mapping; Energy Accounting computes it as the balancing figure.
}


# SLD sheet names that differ from the em_feederinfo feeder names.
SLD_ALIASES = {
    "75 kw compressor 3": "Compressor 3",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", (s or "").lower())).strip()


def main() -> None:
    with engine.begin() as conn:
        # index feeders by normalized name
        meters = conn.execute(text(
            "SELECT device_id, feeder_id, feeder_name FROM pems_meter"
        )).mappings().all()
        by_name: dict[str, tuple[str, int]] = {}
        for m in meters:
            by_name.setdefault(_norm(m["feeder_name"]), (m["device_id"], m["feeder_id"]))

        def resolve(name: str):
            n = _norm(name)
            if n in by_name:
                return by_name[n]
            alias = SLD_ALIASES.get(n)
            return by_name.get(_norm(alias)) if alias else None

        # ---- 1. SLD: parent + cost center onto pems_meter ----
        wb = openpyxl.load_workbook(os.path.join(DOC, "sld and cost center.xlsx"),
                                    read_only=True, data_only=True)
        ws = wb["Sld"]
        sld_updates, sld_unresolved, parent_set = 0, [], set()
        for i, row in enumerate(ws.iter_rows(values_only=True), 1):
            if i == 1:
                continue
            fname, parent, cc = (list(row) + [None, None, None])[:3]
            if not fname:
                continue
            key = resolve(fname)
            if not key:
                sld_unresolved.append(fname)
                continue
            cc_val = str(int(cc)) if isinstance(cc, (int, float)) else None
            # On duplicate SLD rows for a feeder, keep the FIRST parent (the one that links
            # into the tree) — don't let a later row overwrite it.
            set_parent = parent and key not in parent_set
            conn.execute(text(
                "UPDATE pems_meter SET parent_feeder=COALESCE(:p, parent_feeder), "
                "sld_costcenter=:c WHERE device_id=:d AND feeder_id=:f"
            ), {"p": str(parent) if set_parent else None, "c": cc_val,
                "d": key[0], "f": key[1]})
            if set_parent:
                parent_set.add(key)
            sld_updates += 1
        wb.close()
        print(f"SLD: updated {sld_updates} meters; unresolved: {sld_unresolved}")

        # ---- 2. authoritative load -> feeder formulas ----
        loads = {r["load_code"]: r["id"] for r in conn.execute(text(
            "SELECT id, load_code FROM pems_load")).mappings()}
        made, unresolved = 0, []
        for code, feeders in LOAD_FORMULAS.items():
            lid = loads.get(code)
            if not lid:
                continue
            # replace any existing mapping for this load (fuzzy or prior)
            conn.execute(text("DELETE FROM pems_load_feeder_map WHERE load_id=:l"),
                         {"l": lid})
            for fname, coeff in feeders:
                key = resolve(fname)
                if not key:
                    unresolved.append(f"{code}:{fname}")
                    continue
                conn.execute(text(
                    """INSERT INTO pems_load_feeder_map
                         (load_id, device_id, feeder_id, sign, coefficient,
                          is_confirmed, match_score, notes)
                       VALUES (:l,:d,:f,:s,:c,1,100,:n)"""
                ), {"l": lid, "d": key[0], "f": key[1],
                    "s": 1 if coeff >= 0 else -1, "c": coeff,
                    "n": f"authoritative (SLD/SAP formula): {fname} x{coeff}"})
                made += 1
        conn.commit()
        print(f"formulas: seeded {made} feeder links (confirmed); unresolved: {unresolved}")


if __name__ == "__main__":
    main()

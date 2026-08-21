"""Auto-suggest feeder -> load mappings by name similarity.

Produces suggestions in pems_load_feeder_map with is_confirmed=0 and a match_score, for a
human to review/confirm/correct in the Feeder Mapping screen. Never overwrites confirmed
rows. Re-runnable: clears prior *unconfirmed* suggestions first.

Run:  python -m scripts.map_feeders
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from sqlalchemy import text

from app.db import engine

# Alias hints improve matching where the load name and meter name differ in wording.
ALIASES = {
    "MRP": ["mrp"],
    "COLONY": ["colony"],
    "GUEST_HOUSE": ["guest house", "rest h", "vip guest"],
    "ADMIN": ["admin building", "admin bulding"],
    "CANTEEN": ["canteen"],
    "CRANE": ["crane"],
    "COMPRESSOR_1": ["compressor 1", "gcp compressor 1"],
    "COMPRESSOR_2": ["compressor 2"],
    "COMPRESSOR_3": ["compressor 3"],
    "COMPRESSOR_4": ["compressor 4"],
    "BRIQUETTING": ["brqt pdb", "briqt", "cob plant incomer"],
    "GCP_1": ["f-1 gcp", "gcp 1"],
    "GCP_2": ["f-2 gcp", "gcp 2"],
    "GCP_3": ["f-3 gcp", "gcp 3"],
    "GCP_4": ["f-4 gcp", "gcp 4"],
    "GCP_5": ["f-5 gcp", "gcp 5"],
    "FUR-1": ["furnace -1", "furnace-1"],
    "FUR-2": ["furnace -2", "furnace-2"],
    "FUR-3": ["furnace -3", "furnace-3"],
    "FUR-4": ["furnace -4", "furnace-4"],
    "FUR-5": ["furnace -5", "furnace-5"],
}

MIN_SCORE = 45.0   # below this, no suggestion is made (feeder stays unmapped)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())


def _tokens(s: str) -> set[str]:
    return {t for t in _norm(s).split() if t}


def _nums(s: str) -> set[str]:
    return set(re.findall(r"\d+", s or ""))


def score(load_name: str, aliases: list[str], meter_name: str) -> float:
    """0-100 similarity of a load to a meter name.

    Ordering of strength: exact match > token-set equality > substring > fuzzy. A substring
    hit on a longer meter name (e.g. 'Furnace -2 VIB Feeder' vs the cleaner 'Furnace -2') is
    penalised by its extra tokens so the exact meter wins.
    """
    m = _norm(meter_name).strip()
    mt = _tokens(meter_name)
    best = 0.0
    for cand in [load_name, *aliases]:
        c = _norm(cand).strip()
        if not c:
            continue
        ct = _tokens(cand)
        ratio = SequenceMatcher(None, c, m).ratio() * 100
        jac = (len(ct & mt) / len(ct | mt) * 100) if (ct | mt) else 0
        if c == m:
            s = 100.0
        elif ct and ct == mt:
            s = 97.0
        elif c in m:
            extra = len(mt - ct)          # how many extra tokens the meter carries
            s = max(88.0 - 6.0 * extra, 60.0)
        else:
            s = max(ratio, jac)
        # reward/penalise trailing numbers (Furnace-3 vs Furnace -3; GCP 1 vs F-1 GCP)
        cn, mn = _nums(cand), _nums(meter_name)
        if cn and cn == mn:
            s += 12
        elif cn and cn & mn:
            s += 6
        elif cn and not (cn & mn):
            s -= 20   # numbered load matched to different/no number -> penalise
        best = max(best, s)
    return round(min(best, 100.0), 2)


def main() -> None:
    with engine.begin() as conn:
        loads = conn.execute(text(
            "SELECT id, load_code, load_name, load_type, is_derived FROM pems_load"
        )).mappings().all()
        meters = conn.execute(text(
            "SELECT device_id, feeder_id, feeder_name FROM pems_meter"
        )).mappings().all()

        confirmed = {(r[0], r[1], r[2]) for r in conn.execute(text(
            "SELECT load_id, device_id, feeder_id FROM pems_load_feeder_map WHERE is_confirmed=1"
        ))}

        # clear prior suggestions (keep confirmed)
        conn.execute(text("DELETE FROM pems_load_feeder_map WHERE is_confirmed=0"))

        made, skipped_loads = 0, []
        used_meters: set[tuple[str, int]] = set()
        for ld in loads:
            # derived/aggregate loads (Grid, Auxiliary, Misc) are not single-meter; skip auto-map
            if ld["is_derived"] or ld["load_type"] in ("grid", "aux"):
                continue
            aliases = ALIASES.get(ld["load_code"], [])
            ranked = sorted(
                ((m, score(ld["load_name"], aliases, m["feeder_name"])) for m in meters),
                key=lambda x: x[1], reverse=True,
            )
            best_meter, best_score = ranked[0]
            if best_score < MIN_SCORE:
                skipped_loads.append(ld["load_code"])
                continue
            key = (ld["id"], best_meter["device_id"], best_meter["feeder_id"])
            if key in confirmed:
                continue
            conn.execute(text(
                """INSERT INTO pems_load_feeder_map
                     (load_id, device_id, feeder_id, sign, is_confirmed, match_score, notes)
                   VALUES (:lid,:dev,:fid,1,0,:sc,:note)
                   ON DUPLICATE KEY UPDATE match_score=:sc, notes=:note"""
            ), {"lid": ld["id"], "dev": best_meter["device_id"],
                "fid": best_meter["feeder_id"], "sc": best_score,
                "note": f"auto: '{ld['load_name']}' ~ '{best_meter['feeder_name']}'"})
            used_meters.add((best_meter["device_id"], best_meter["feeder_id"]))
            made += 1
            print(f"  {ld['load_code']:14s} -> {best_meter['device_id']}/{best_meter['feeder_id']:<4} "
                  f"[{best_score:5.1f}] {best_meter['feeder_name']}")

        print(f"\nsuggested {made} mappings; {len(skipped_loads)} loads below threshold: "
              f"{skipped_loads}")
        total_meters = len(meters)
        print(f"meters mapped: {len(used_meters)}/{total_meters} "
              f"({total_meters - len(used_meters)} unmapped)")


if __name__ == "__main__":
    main()

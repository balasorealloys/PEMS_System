"""Seed PEMS master data (idempotent).

Sources:
  * Cost centers  -> Power Auxiliary Power.xlsx / Energy Master
  * Loads         -> Energy Master_05_2026.xlsx (Individual Loads + Furnaces + Grid)
  * Tariff        -> OERC FY2026-27 notification (docs/TARIFF_FY2026-27.md)
  * Meters        -> synced from read-only em_deviceinfo + em_feederinfo

Run:  python -m scripts.seed_master
"""
from __future__ import annotations

import json
import re
from datetime import datetime

from sqlalchemy import text

from app.config import get_settings
from app.db import engine

settings = get_settings()

# --- SAP cost centers (code -> (description, category)) -------------------------
COST_CENTERS = [
    ("1100011017", "CRUSHER PRODUCTION", "production"),
    ("1100013022", "COLONY", "residential"),
    ("1100013016", "REST HOUSE-BAL PLANT", "residential"),
    ("1100015020", "ADMN.BUILDING", "admin"),
    ("1100013015", "CANTEEN (BAL)", "amenity"),
    ("1100011008", "CRANES (COMMON)", "common"),
    ("1100012003", "AIR SYSTEM (BAL)", "utility"),
    ("1100012002", "WATER & C.TOWER(BAL)", "utility"),
    ("1100011023", "BRQT PLANT PRD UNIT", "production"),
    ("1100011009", "GCP (COMMON)", "common"),
    ("1100011006", "FURNACE (COMMON)", "common"),
    ("1100011001", "FURNACE-1", "furnace"),
    ("1100011002", "FURNACE-2", "furnace"),
    ("1100011003", "FURNACE-3", "furnace"),
    ("1100011004", "FURNACE-4", "furnace"),
    ("1100011005", "FURNACE-5", "furnace"),
]

# --- Loads: (code, name, cost_center, section, load_type, is_derived, order) ----
LOADS = [
    ("GRID",         "Grid (TPNODL Incomer)",   None,         "Grid",     "grid",       0, 1),
    ("FUR-1",        "Furnace-1",               "1100011001", "Furnace",  "furnace",    0, 10),
    ("FUR-2",        "Furnace-2",               "1100011002", "Furnace",  "furnace",    0, 11),
    ("FUR-3",        "Furnace-3",               "1100011003", "Furnace",  "furnace",    0, 12),
    ("FUR-4",        "Furnace-4",               "1100011004", "Furnace",  "furnace",    0, 13),
    ("FUR-5",        "Furnace-5",               "1100011005", "Furnace",  "furnace",    0, 14),
    ("AUXILIARY",    "Total Auxiliary (derived)", None,       "Auxiliary","aux",        1, 20),
    ("MRP",          "MRP / Crusher",           "1100011017", "Utility",  "individual", 0, 30),
    ("COLONY",       "Colony",                  "1100013022", "Colony",   "individual", 0, 31),
    ("GUEST_HOUSE",  "Guest House",             "1100013016", "Colony",   "individual", 0, 32),
    ("ADMIN",        "Admin Building",          "1100015020", "Admin",    "individual", 0, 33),
    ("CANTEEN",      "Canteen",                 "1100013015", "Amenity",  "individual", 0, 34),
    ("CRANE",        "Crane",                   "1100011008", "Common",   "individual", 0, 35),
    ("COMPRESSOR_1", "Compressor-1",            "1100012003", "Air",      "individual", 0, 36),
    ("COMPRESSOR_2", "Compressor-2",            "1100012003", "Air",      "individual", 0, 37),
    ("COMPRESSOR_3", "Compressor-3",            "1100012003", "Air",      "individual", 0, 38),
    ("COMPRESSOR_4", "Compressor-4",            "1100012003", "Air",      "individual", 0, 39),
    ("PUMPS_CT",     "Pumps & Cooling Tower",   "1100012002", "Water",    "individual", 0, 40),
    ("BRIQUETTING",  "Briquetting Plant",       "1100011023", "Briquet",  "individual", 0, 41),
    ("GCP_1",        "G.C.P-1",                 "1100011009", "GCP",      "individual", 0, 42),
    ("GCP_2",        "G.C.P-2",                 "1100011009", "GCP",      "individual", 0, 43),
    ("GCP_3",        "G.C.P-3",                 "1100011009", "GCP",      "individual", 0, 44),
    ("GCP_4",        "G.C.P-4",                 "1100011009", "GCP",      "individual", 0, 45),
    ("GCP_5",        "G.C.P-5",                 "1100011009", "GCP",      "individual", 0, 46),
    # Derived allocations (no dedicated meter in the Energy Master — sub-splits of the
    # FURNACE (COMMON) cost center / residual). Marked is_derived so they are not
    # auto-mapped to feeders and do not double-count furnace energy.
    ("MAIN_LIGHTING","Main Lighting DB",        "1100011006", "Common",   "individual", 1, 47),
    ("FUR1_AUX",     "Furnace-1 Aux",           "1100011006", "Furnace",  "individual", 1, 48),
    ("FUR2_AUX",     "Furnace-2 Aux",           "1100011006", "Furnace",  "individual", 1, 49),
    ("FUR3_AUX",     "Furnace-3 Aux",           "1100011006", "Furnace",  "individual", 1, 50),
    ("FUR45_AUX",    "Furnace-4&5 Aux",         "1100011006", "Furnace",  "individual", 1, 51),
    ("MISC",         "Miscellaneous + Line loss", "1100011006","Common",  "individual", 1, 52),
]

# --- App config -----------------------------------------------------------------
CONFIG = [
    ("grid_meter_mf",       "480000", "int",   "Grid meter multiplication factor"),
    ("contract_demand_kva", "56000",  "int",   "TPNODL contract demand (kVA)"),
    ("client_id",           settings.client_id, "string", "EMS client id"),
    ("plant_id",            settings.plant_id,  "string", "EMS plant id"),
    ("main_incomer",        json.dumps({"device_id": "DI1001", "feeder_id": 21}),
                            "json", "Main 132 kV grid incomer meter"),
    ("sap_default_unit_rate", "7.0", "float", "Default Rs/kWh rate for SAP daily posting"),
]

# --- Tariff: OERC FY2026-27, EHT Heavy Industry (docs/TARIFF_FY2026-27.md) -------
TARIFF = dict(
    name="OERC FY2026-27",
    tariff_order_ref="OERC common Order 24.03.2026, Case 124-127/2025 (TPNODL)",
    voltage_class="EHT",
    consumer_category="Heavy Industry",
    effective_from="2026-04-01",
    status="active",
    slab_lf_low_rate=5.80,
    slab_lf_high_rate=4.70,
    lf_threshold_pct=60.0,
    demand_charge=250.0,
    electricity_duty_pct=9.0,
    meter_rent=2000.0,
    customer_service_charge=700.0,
    colony_rate=4.85,
    tod_rates_json=json.dumps({
        "effective_from": "2026-07-01",
        "solar": 0.90, "normal": 1.00, "peak": 1.10,
        "windows": {"solar": "08:00-16:00", "normal": ["16:00-18:00", "00:00-08:00"],
                    "peak": "18:00-00:00"},
    }),
    rebates_json=json.dumps({
        "eht_hlf_rebate_paise_per_kvah": 30, "hlf_rebate_lf_threshold_pct": 80,
        "overdrawal_cd_allowance_pct": 120,
    }),
    notes="Confirmed against May-2026 TPNODL bill. DPS rate per live bill (1.25%/mo), "
          "not the notification's 1%/mo LT/HT-domestic clause.",
)


def seed_cost_centers(conn) -> None:
    for code, desc, cat in COST_CENTERS:
        conn.execute(text(
            """INSERT INTO pems_cost_center (sap_costcenter, description, category)
               VALUES (:c, :d, :cat)
               ON DUPLICATE KEY UPDATE description=:d, category=:cat"""
        ), {"c": code, "d": desc, "cat": cat})
    print(f"  cost centers: {len(COST_CENTERS)}")


def seed_loads(conn) -> None:
    for code, name, cc, section, ltype, derived, order in LOADS:
        conn.execute(text(
            """INSERT INTO pems_load
                 (load_code, load_name, sap_costcenter, section, load_type, is_derived, display_order)
               VALUES (:code, :name, :cc, :section, :ltype, :derived, :order)
               ON DUPLICATE KEY UPDATE load_name=:name, sap_costcenter=:cc,
                 section=:section, load_type=:ltype, is_derived=:derived, display_order=:order"""
        ), {"code": code, "name": name, "cc": cc, "section": section,
            "ltype": ltype, "derived": derived, "order": order})
    print(f"  loads: {len(LOADS)}")


def seed_config(conn) -> None:
    for key, val, dtype, desc in CONFIG:
        conn.execute(text(
            """INSERT INTO pems_config (cfg_key, cfg_value, data_type, description)
               VALUES (:k, :v, :t, :d)
               ON DUPLICATE KEY UPDATE cfg_value=:v, data_type=:t, description=:d"""
        ), {"k": key, "v": val, "t": dtype, "d": desc})
    print(f"  config: {len(CONFIG)}")


def seed_tariff(conn) -> None:
    cols = ", ".join(TARIFF.keys())
    params = ", ".join(f":{k}" for k in TARIFF)
    updates = ", ".join(f"{k}=:{k}" for k in TARIFF if k != "effective_from")
    conn.execute(text(
        f"INSERT INTO pems_tariff ({cols}) VALUES ({params}) "
        f"ON DUPLICATE KEY UPDATE {updates}"
    ), TARIFF)
    print("  tariff: OERC FY2026-27 EHT Heavy Industry")


def sync_meters(conn) -> None:
    """Populate pems_meter from read-only em_deviceinfo + em_feederinfo."""
    devices = {r[0]: r[1] for r in conn.execute(text(
        "SELECT DeviceID, DeviceName FROM em_deviceinfo WHERE ClientID=:c AND PlantID=:p"
    ), {"c": settings.client_id, "p": settings.plant_id})}

    incomers = {(r[0], r[1]) for r in conn.execute(text(
        "SELECT DeviceID, FeederID FROM em_incomerinfo WHERE ClientID=:c AND PlantID=:p"
    ), {"c": settings.client_id, "p": settings.plant_id})}

    feeders = conn.execute(text(
        """SELECT DeviceID, FeederID, FeederName, FeederLocation, IsEnabled, IsVirtualFeeder
           FROM em_feederinfo WHERE ClientID=:c AND PlantID=:p"""
    ), {"c": settings.client_id, "p": settings.plant_id}).mappings().all()

    n = 0
    for f in feeders:
        dev, fid, fname = f["DeviceID"], f["FeederID"], (f["FeederName"] or "")
        is_incomer = (dev, fid) in incomers or "incomer" in fname.lower()
        role = _classify_role(dev, fid, fname, is_incomer)
        section = _classify_section(devices.get(dev, ""), fname)
        conn.execute(text(
            """INSERT INTO pems_meter
                 (device_id, feeder_id, client_id, plant_id, device_name, feeder_name,
                  feeder_location, section, role, is_incomer, is_enabled, is_virtual, synced_at)
               VALUES (:dev,:fid,:cid,:pid,:dn,:fn,:loc,:sec,:role,:inc,:en,:virt,:ts)
               ON DUPLICATE KEY UPDATE device_name=:dn, feeder_name=:fn, feeder_location=:loc,
                 section=:sec, role=:role, is_incomer=:inc, is_enabled=:en, is_virtual=:virt,
                 synced_at=:ts"""
        ), {"dev": dev, "fid": fid, "cid": settings.client_id, "pid": settings.plant_id,
            "dn": devices.get(dev), "fn": fname, "loc": f["FeederLocation"],
            "sec": section, "role": role, "inc": int(is_incomer),
            "en": int(f["IsEnabled"] or 0), "virt": int(f["IsVirtualFeeder"] or 0),
            "ts": datetime.now()})
        n += 1
    print(f"  meters synced: {n}")


# The 5 furnace main feeders (authoritative, from the meter list / Energy Master).
FURNACE_MAINS = {("DI1003", 98), ("DI1003", 51), ("DI1002", 25),
                 ("DI1003", 52), ("DI1003", 66)}
GRID_MAIN = ("DI1001", 21)     # 132 kV main incomer
# Incomer-side / transformer metering points (not consumers) — kept out of load sums.
_INCOMER_RE = re.compile(r"\bmva\b|\bpt\s*-?\s*\d|\bpto\b|incomer|h\.?t\.?\s*\(|lt\s*-?\s*\d",
                         re.IGNORECASE)


def _classify_role(dev: str, fid: int, name: str, is_incomer: bool) -> str:
    if (dev, fid) == GRID_MAIN:
        return "grid"
    if (dev, fid) in FURNACE_MAINS:
        return "furnace"
    if is_incomer or _INCOMER_RE.search(name or ""):
        return "incomer"
    return "aux"


def _classify_section(device_name: str, feeder_name: str) -> str:
    s = f"{device_name} {feeder_name}".lower()
    if "gcp" in s:
        return "GCP"
    if "furnace" in s or "fce" in s or "fur" in s:
        return "Furnace"
    if "compressor" in s or "air" in s:
        return "Air"
    if "pump" in s or "c.t" in s or "cooling" in s:
        return "Water"
    if "brq" in s or "briq" in s or "bqt" in s or "cob" in s:
        return "Briquetting"
    if "colony" in s or "guest" in s or "canteen" in s or "admin" in s:
        return "Colony/Amenity"
    return "Other"


def main() -> None:
    print("seeding PEMS master data ...")
    with engine.begin() as conn:
        seed_cost_centers(conn)
        seed_loads(conn)
        seed_config(conn)
        seed_tariff(conn)
        sync_meters(conn)
    print("done.")


if __name__ == "__main__":
    main()

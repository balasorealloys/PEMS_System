"""Date-effective configuration: operational constants + tariff versions.

Everything the rate / accounting engines used to hard-code (meter factor, contract
demand, ToD adders, MMFC floor) now lives in ``pems_constant``, versioned by
``effective_from``. The regulated tariff lives in ``pems_tariff`` (already dated).
Both are edited from System Settings so nothing needs a code change to update.
"""
from __future__ import annotations

import json
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


# ----------------------------------------------------------------- audit trail
def _audit(db: Session, *, entity: str, entity_key: str, action: str, detail: str,
           effective_from: str | None = None, by: str | None = None) -> None:
    db.execute(text(
        "INSERT INTO pems_audit (entity, entity_key, action, detail, effective_from, changed_by) "
        "VALUES (:e,:k,:a,:d,:ef,:by)"),
        {"e": entity, "k": entity_key, "a": action, "d": detail[:500],
         "ef": effective_from, "by": by or "web"})


def list_audit(db: Session, limit: int = 100) -> list[dict]:
    rows = db.execute(text(
        "SELECT id, entity, entity_key, action, detail, effective_from, changed_by, changed_at "
        "FROM pems_audit ORDER BY changed_at DESC, id DESC LIMIT :n"), {"n": limit}).mappings().all()
    return [{
        "id": r["id"], "entity": r["entity"], "entity_key": r["entity_key"], "action": r["action"],
        "detail": r["detail"], "effective_from": r["effective_from"].isoformat() if r["effective_from"] else None,
        "changed_by": r["changed_by"], "changed_at": r["changed_at"].isoformat() if r["changed_at"] else None,
    } for r in rows]

# Fallback defaults — used only if a key has no row on/before the asked date.
CONST_DEFAULTS: dict[str, float] = {
    "meter_mult_factor": 1.01,
    "contract_demand_kva": 56000.0,
    "mmfc_floor_pct": 80.0,
    "tod_peak_adder": 0.30,
    "tod_solar_incentive": 0.20,
}


# ------------------------------------------------------------------ constants
def const_val(db: Session, key: str, on: date | datetime, default: float | None = None) -> float:
    """Effective value of a constant on a given date (latest effective_from <= date)."""
    if isinstance(on, datetime):
        on = on.date()
    v = db.execute(text(
        "SELECT cvalue FROM pems_constant WHERE ckey=:k AND effective_from<=:d "
        "ORDER BY effective_from DESC LIMIT 1"), {"k": key, "d": on}).scalar()
    if v is not None:
        return float(v)
    if default is not None:
        return float(default)
    return float(CONST_DEFAULTS.get(key, 0.0))


def list_constants(db: Session) -> list[dict]:
    """All constant versions, newest effective_from first within each key."""
    rows = db.execute(text(
        "SELECT id, ckey, label, category, unit, cvalue, effective_from, note, updated_by, updated_at "
        "FROM pems_constant ORDER BY category, ckey, effective_from DESC")).mappings().all()
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "ckey": r["ckey"], "label": r["label"], "category": r["category"],
            "unit": r["unit"], "cvalue": float(r["cvalue"]),
            "effective_from": r["effective_from"].isoformat(),
            "note": r["note"], "updated_by": r["updated_by"],
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return out


def upsert_constant(db: Session, *, ckey: str, label: str, category: str, unit: str | None,
                    cvalue: float, effective_from: str, note: str | None, updated_by: str | None) -> list[dict]:
    """Add or overwrite a constant version. Uniqueness is (ckey, effective_from):
    saving the same key+date updates that version; a new date creates a new one."""
    exists = db.execute(text(
        "SELECT cvalue FROM pems_constant WHERE ckey=:k AND effective_from=:ef"),
        {"k": ckey, "ef": effective_from}).scalar()
    db.execute(text(
        "INSERT INTO pems_constant (ckey, label, category, unit, cvalue, effective_from, note, updated_by) "
        "VALUES (:k,:l,:cat,:u,:v,:ef,:n,:by) "
        "ON CONFLICT (ckey, effective_from) DO UPDATE SET label=EXCLUDED.label, category=EXCLUDED.category, "
        "unit=EXCLUDED.unit, cvalue=EXCLUDED.cvalue, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by"),
        {"k": ckey, "l": label, "cat": category or "General", "u": unit,
         "v": cvalue, "ef": effective_from, "n": note, "by": updated_by})
    action = "update" if exists is not None else "create"
    unit_s = f" {unit}" if unit else ""
    prev = f" (was {float(exists):g}{unit_s})" if exists is not None else ""
    _audit(db, entity="constant", entity_key=ckey, action=action,
           detail=f"{label} = {cvalue:g}{unit_s}{prev}", effective_from=effective_from, by=updated_by)
    db.commit()
    return list_constants(db)


def delete_constant(db: Session, cid: int, by: str | None = None) -> list[dict]:
    row = db.execute(text(
        "SELECT ckey, label, cvalue, unit, effective_from FROM pems_constant WHERE id=:i"),
        {"i": cid}).mappings().first()
    db.execute(text("DELETE FROM pems_constant WHERE id=:i"), {"i": cid})
    if row:
        unit_s = f" {row['unit']}" if row["unit"] else ""
        _audit(db, entity="constant", entity_key=row["ckey"], action="delete",
               detail=f"removed {row['label']} = {float(row['cvalue']):g}{unit_s}",
               effective_from=row["effective_from"].isoformat(), by=by)
    db.commit()
    return list_constants(db)


# ------------------------------------------------------- per-meter factors
def meter_factors(db: Session, on: date | datetime | None = None) -> dict:
    """{(device_id, feeder_id): mult_factor} in force on a date (date-effective).
    For each meter, the latest version with effective_from <= date wins."""
    if on is None:
        on = date.today()
    if isinstance(on, datetime):
        on = on.date()
    rows = db.execute(text(
        "SELECT device_id, feeder_id, mult_factor FROM pems_meter_factor "
        "WHERE effective_from <= :d ORDER BY device_id, feeder_id, effective_from"),
        {"d": on}).all()
    out: dict = {}
    for r in rows:                        # ascending date → last write per meter is the latest
        out[(r[0], r[1])] = float(r[2])
    return out


def list_meter_factors(db: Session) -> dict:
    """Overrides grouped by meter (newest version first), plus the global default."""
    default = const_val(db, "meter_mult_factor", datetime.now().date(), 1.01)
    rows = db.execute(text(
        "SELECT f.device_id, f.feeder_id, f.effective_from, f.mult_factor, f.note, "
        "       f.updated_by, f.updated_at, m.feeder_name "
        "FROM pems_meter_factor f "
        "LEFT JOIN pems_meter m ON m.device_id=f.device_id AND m.feeder_id=f.feeder_id "
        "ORDER BY m.feeder_name, f.effective_from DESC")).mappings().all()
    meters: dict = {}
    for r in rows:
        k = (r["device_id"], r["feeder_id"])
        meters.setdefault(k, {
            "device_id": r["device_id"], "feeder_id": r["feeder_id"],
            "feeder_name": r["feeder_name"], "versions": [],
        })["versions"].append({
            "mult_factor": float(r["mult_factor"]),
            "effective_from": r["effective_from"].isoformat(),
            "note": r["note"], "updated_by": r["updated_by"],
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return {"default": default, "meters": list(meters.values())}


def upsert_meter_factor(db: Session, *, device_id: str, feeder_id: int, mult_factor: float,
                        effective_from: str, note: str | None, by: str | None) -> dict:
    exists = db.execute(text(
        "SELECT mult_factor FROM pems_meter_factor WHERE device_id=:d AND feeder_id=:f AND effective_from=:ef"),
        {"d": device_id, "f": feeder_id, "ef": effective_from}).scalar()
    name = db.execute(text(
        "SELECT feeder_name FROM pems_meter WHERE device_id=:d AND feeder_id=:f"),
        {"d": device_id, "f": feeder_id}).scalar() or f"{device_id}/{feeder_id}"
    db.execute(text(
        "INSERT INTO pems_meter_factor (device_id, feeder_id, effective_from, mult_factor, note, updated_by) "
        "VALUES (:d,:f,:ef,:v,:n,:by) "
        "ON CONFLICT (device_id, feeder_id, effective_from) DO UPDATE SET "
        "mult_factor=EXCLUDED.mult_factor, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by"),
        {"d": device_id, "f": feeder_id, "ef": effective_from, "v": mult_factor, "n": note, "by": by})
    prev = f" (was ×{float(exists):g})" if exists is not None else ""
    _audit(db, entity="meter_factor", entity_key=f"{device_id}/{feeder_id}",
           action="update" if exists is not None else "create",
           detail=f"{name} factor ×{mult_factor:g}{prev}", effective_from=effective_from, by=by)
    db.commit()
    return list_meter_factors(db)


def delete_meter_factor(db: Session, device_id: str, feeder_id: int,
                        effective_from: str, by: str | None = None) -> dict:
    name = db.execute(text(
        "SELECT feeder_name FROM pems_meter WHERE device_id=:d AND feeder_id=:f"),
        {"d": device_id, "f": feeder_id}).scalar() or f"{device_id}/{feeder_id}"
    db.execute(text(
        "DELETE FROM pems_meter_factor WHERE device_id=:d AND feeder_id=:f AND effective_from=:ef"),
        {"d": device_id, "f": feeder_id, "ef": effective_from})
    _audit(db, entity="meter_factor", entity_key=f"{device_id}/{feeder_id}", action="delete",
           detail=f"removed {name} factor version", effective_from=effective_from, by=by)
    db.commit()
    return list_meter_factors(db)


# -------------------------------------------------------------------- tariffs
TARIFF_FIELDS = (
    "name", "tariff_order_ref", "voltage_class", "consumer_category", "effective_from",
    "effective_to", "status", "slab_lf_low_rate", "slab_lf_high_rate", "lf_threshold_pct",
    "demand_charge", "electricity_duty_pct", "meter_rent", "customer_service_charge",
    "colony_rate", "notes",
)


def _tariff_row(r) -> dict:
    d = dict(r)
    for k, v in list(d.items()):
        if isinstance(v, (date, datetime)):
            d[k] = v.isoformat()
        elif hasattr(v, "__float__") and not isinstance(v, (int, float, bool)):
            d[k] = float(v)  # Decimal → float
    return d


def list_tariffs(db: Session) -> list[dict]:
    rows = db.execute(text(
        "SELECT id, name, tariff_order_ref, voltage_class, consumer_category, effective_from, "
        "effective_to, status, slab_lf_low_rate, slab_lf_high_rate, lf_threshold_pct, demand_charge, "
        "electricity_duty_pct, meter_rent, customer_service_charge, colony_rate, notes, updated_at "
        "FROM pems_tariff ORDER BY effective_from DESC")).mappings().all()
    return [_tariff_row(r) for r in rows]


def upsert_tariff(db: Session, data: dict, by: str | None = None) -> list[dict]:
    """Insert a new tariff version, or update an existing one when ``id`` is given.
    Only the editable scalar fields are written; JSON blobs are left untouched."""
    tid = data.get("id")
    cols = {k: data.get(k) for k in TARIFF_FIELDS if k in data}
    name = data.get("name") or "tariff"
    eff = data.get("effective_from")
    if tid:
        sets = ", ".join(f"{k}=:{k}" for k in cols)
        if sets:
            db.execute(text(f"UPDATE pems_tariff SET {sets} WHERE id=:id"), {**cols, "id": tid})
        _audit(db, entity="tariff", entity_key=str(name), action="update",
               detail=f"updated tariff '{name}' (demand ₹{data.get('demand_charge')}, duty {data.get('electricity_duty_pct')}%)",
               effective_from=eff, by=by)
    else:
        keys = list(cols.keys())
        placeholders = ", ".join(f":{k}" for k in keys)
        db.execute(text(f"INSERT INTO pems_tariff ({', '.join(keys)}) VALUES ({placeholders})"), cols)
        _audit(db, entity="tariff", entity_key=str(name), action="create",
               detail=f"scheduled tariff '{name}' effective {eff}", effective_from=eff, by=by)
    db.commit()
    return list_tariffs(db)


# --------------------------------------------------------------- system config
# Flat pems_config keys surfaced in the UI. sap.* is managed separately; client/
# plant IDs come from deployment config (env) and only decide table names, so
# they're shown read-only. main_incomer is editable but applied on restart.
SYSTEM_KEYS: dict[str, dict] = {
    "main_incomer": {"label": "Main 132 kV grid incomer", "editable": True,
                     "kind": "meter", "note": "Applied on next restart."},
    "grid_meter_mf": {"label": "Grid meter multiplication factor", "editable": True, "kind": "int"},
    "contract_demand_kva": {"label": "Contract demand (legacy copy)", "editable": False,
                            "kind": "int", "note": "Live value lives in Constants → Demand."},
    "client_id": {"label": "EMS client id", "editable": False, "kind": "string",
                  "note": "Deployment-level — decides the source data tables."},
    "plant_id": {"label": "EMS plant id", "editable": False, "kind": "string",
                 "note": "Deployment-level."},
}


def get_system_config(db: Session) -> list[dict]:
    have = {r[0]: (r[1], r[2]) for r in db.execute(text(
        "SELECT cfg_key, cfg_value, data_type FROM pems_config "
        "WHERE cfg_key IN :keys").bindparams(__import__("sqlalchemy").bindparam("keys", expanding=True)),
        {"keys": list(SYSTEM_KEYS)}).all()}
    out = []
    for k, meta in SYSTEM_KEYS.items():
        val, dtype = have.get(k, (None, meta.get("kind", "string")))
        out.append({"cfg_key": k, "cfg_value": val, "data_type": dtype, **meta})
    return out


def set_system_config(db: Session, cfg_key: str, cfg_value: str, by: str | None = None) -> list[dict]:
    meta = SYSTEM_KEYS.get(cfg_key)
    if not meta or not meta.get("editable"):
        raise ValueError(f"{cfg_key} is not editable")
    dtype = meta.get("kind", "string")
    # normalise / validate the meter object
    if meta.get("kind") == "meter":
        j = cfg_value if isinstance(cfg_value, dict) else json.loads(cfg_value)
        cfg_value = json.dumps({"device_id": str(j["device_id"]), "feeder_id": int(j["feeder_id"])})
        dtype = "json"
    old = db.execute(text("SELECT cfg_value FROM pems_config WHERE cfg_key=:k"), {"k": cfg_key}).scalar()
    db.execute(text(
        "INSERT INTO pems_config (cfg_key, cfg_value, data_type) VALUES (:k,:v,:dt) "
        "ON CONFLICT (cfg_key) DO UPDATE SET cfg_value=EXCLUDED.cfg_value, data_type=EXCLUDED.data_type"),
        {"k": cfg_key, "v": cfg_value, "dt": dtype})
    _audit(db, entity="system", entity_key=cfg_key, action="update",
           detail=f"{meta['label']} → {cfg_value}" + (f" (was {old})" if old else ""), by=by)
    db.commit()
    return get_system_config(db)

"""Feeder-mapping master-data service (ERP-style CRUD over pems_ tables).

The mapping hierarchy is: meter (feeder) -> load -> cost center. Auto-suggested mappings
carry is_confirmed=false; any manual create/edit is treated as confirmed. All writes are
audit-logged.
"""
from __future__ import annotations

import json
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.plant import MAIN as MAIN_INCOMER  # 132 kV grid incomer, from config


def list_cost_centers(db: Session) -> list[dict]:
    rows = db.execute(text(
        "SELECT id, sap_costcenter, description, category, is_active "
        "FROM pems_cost_center ORDER BY sap_costcenter"
    )).mappings().all()
    return [dict(r) for r in rows]


def list_loads(db: Session) -> list[dict]:
    rows = db.execute(text(
        """SELECT l.id, l.load_code, l.load_name, l.sap_costcenter, cc.description AS costcenter_desc,
                  l.section, l.load_type, l.is_derived, l.display_order, l.is_active
           FROM pems_load l
           LEFT JOIN pems_cost_center cc ON cc.sap_costcenter = l.sap_costcenter
           ORDER BY l.display_order, l.load_code"""
    )).mappings().all()
    return [dict(r) for r in rows]


def list_meters(db: Session, *, only: str | None = None, section: str | None = None,
                search: str | None = None) -> list[dict]:
    """Meters with their current (open) mappings.

    `only`: 'unmapped' | 'unconfirmed' | 'mapped' filter.
    """
    meters = db.execute(text(
        """SELECT device_id, feeder_id, feeder_name, feeder_location, device_name,
                  section, role, is_incomer, is_enabled, is_virtual
           FROM pems_meter ORDER BY device_id, feeder_id"""
    )).mappings().all()

    maps = db.execute(text(
        """SELECT m.id AS map_id, m.load_id, m.device_id, m.feeder_id, m.sign,
                  m.is_confirmed, m.match_score, m.notes,
                  l.load_code, l.load_name, l.sap_costcenter, cc.description AS costcenter_desc
           FROM pems_load_feeder_map m
           JOIN pems_load l ON l.id = m.load_id
           LEFT JOIN pems_cost_center cc ON cc.sap_costcenter = l.sap_costcenter
           WHERE m.effective_to IS NULL"""
    )).mappings().all()

    by_meter: dict[tuple[str, int], list[dict]] = {}
    for mp in maps:
        by_meter.setdefault((mp["device_id"], mp["feeder_id"]), []).append(dict(mp))

    out = []
    for me in meters:
        key = (me["device_id"], me["feeder_id"])
        mps = by_meter.get(key, [])
        row = dict(me)
        row["mappings"] = mps
        row["is_mapped"] = bool(mps)
        row["is_confirmed"] = bool(mps) and all(m["is_confirmed"] for m in mps)
        out.append(row)

    if only == "unmapped":
        out = [r for r in out if not r["is_mapped"]]
    elif only == "unconfirmed":
        out = [r for r in out if r["is_mapped"] and not r["is_confirmed"]]
    elif only == "mapped":
        out = [r for r in out if r["is_mapped"]]
    if section:
        out = [r for r in out if (r["section"] or "").lower() == section.lower()]
    if search:
        s = search.lower()
        out = [r for r in out if s in (r["feeder_name"] or "").lower()
               or s in (r["device_name"] or "").lower()]
    return out


def summary(db: Session) -> dict:
    total_meters = db.execute(text("SELECT COUNT(*) FROM pems_meter")).scalar()
    enabled = db.execute(text("SELECT COUNT(*) FROM pems_meter WHERE is_enabled=true")).scalar()
    mapped_meters = db.execute(text(
        "SELECT COUNT(DISTINCT (device_id, feeder_id)) FROM pems_load_feeder_map "
        "WHERE effective_to IS NULL"
    )).scalar()
    confirmed = db.execute(text(
        "SELECT COUNT(*) FROM pems_load_feeder_map WHERE effective_to IS NULL AND is_confirmed=true"
    )).scalar()
    unconfirmed = db.execute(text(
        "SELECT COUNT(*) FROM pems_load_feeder_map WHERE effective_to IS NULL AND is_confirmed=false"
    )).scalar()
    total_loads = db.execute(text("SELECT COUNT(*) FROM pems_load")).scalar()
    mapped_loads = db.execute(text(
        "SELECT COUNT(DISTINCT load_id) FROM pems_load_feeder_map WHERE effective_to IS NULL"
    )).scalar()
    return {
        "total_meters": total_meters, "enabled_meters": enabled,
        "mapped_meters": mapped_meters, "unmapped_meters": total_meters - mapped_meters,
        "confirmed_mappings": confirmed, "unconfirmed_mappings": unconfirmed,
        "total_loads": total_loads, "mapped_loads": mapped_loads,
        "unmapped_loads": total_loads - mapped_loads,
    }


def mapping_tree(db: Session) -> dict:
    """Cost center -> loads -> feeders hierarchy, with live KW per feeder.

    Powers the Cost Center Map visualization. Structural loads (grid / auxiliary,
    no cost center) are grouped separately.
    """
    from datetime import timedelta
    from app.config import get_settings
    s = get_settings()
    vd = f"em_valuedata_{s.client_id.lower()}"

    # filtered by the main incomer so this uses the (DeviceID, FeederID, DateTimeStamp)
    # primary key index — an unfiltered MAX() over the ~20M-row table is a full scan.
    latest = db.execute(text(
        f"SELECT MAX(DateTimeStamp) FROM {vd} WHERE DeviceID=:d AND FeederID=:f"
    ), {"d": MAIN_INCOMER[0], "f": MAIN_INCOMER[1]}).scalar()
    kw: dict[tuple[str, int], float] = {}
    if latest:
        since = latest - timedelta(minutes=15)
        for r in db.execute(text(
            f"""SELECT v.DeviceID d, v.FeederID f, v.KW kw FROM {vd} v
                JOIN (SELECT DeviceID, FeederID, MAX(DateTimeStamp) ts FROM {vd}
                      WHERE DateTimeStamp>=:s GROUP BY DeviceID, FeederID) l
                  ON v.DeviceID=l.DeviceID AND v.FeederID=l.FeederID AND v.DateTimeStamp=l.ts"""
        ), {"s": since}).mappings():
            kw[(r["d"], r["f"])] = float(r["kw"] or 0)

    loads = db.execute(text(
        """SELECT l.id, l.load_code, l.load_name, l.load_type, l.sap_costcenter,
                  cc.description AS cc_desc, l.display_order
           FROM pems_load l LEFT JOIN pems_cost_center cc ON cc.sap_costcenter=l.sap_costcenter
           ORDER BY l.display_order"""
    )).mappings().all()

    feeders_by_load: dict[int, list[dict]] = {}
    for m in db.execute(text(
        """SELECT m.load_id, m.device_id, m.feeder_id, m.coefficient, m.is_confirmed,
                  mt.feeder_name, mt.role, mt.section
           FROM pems_load_feeder_map m JOIN pems_meter mt
             ON mt.device_id=m.device_id AND mt.feeder_id=m.feeder_id
           WHERE m.effective_to IS NULL"""
    )).mappings():
        feeders_by_load.setdefault(m["load_id"], []).append({
            "device_id": m["device_id"], "feeder_id": m["feeder_id"],
            "feeder_name": m["feeder_name"], "role": m["role"], "section": m["section"],
            "coefficient": float(m["coefficient"]) if m["coefficient"] is not None else 1.0,
            "is_confirmed": bool(m["is_confirmed"]),
            "kw": round(kw.get((m["device_id"], m["feeder_id"]), 0.0), 1),
        })

    groups: dict[str, dict] = {}
    structural: list[dict] = []
    for l in loads:
        feeders = feeders_by_load.get(l["id"], [])
        node = {"load_code": l["load_code"], "load_name": l["load_name"],
                "load_type": l["load_type"], "feeders": feeders,
                "feeder_count": len(feeders),
                "kw": round(sum(f["kw"] * f["coefficient"] for f in feeders), 1)}
        if not l["sap_costcenter"]:
            structural.append(node)
            continue
        g = groups.setdefault(l["sap_costcenter"], {
            "sap_costcenter": l["sap_costcenter"], "description": l["cc_desc"],
            "loads": [], "feeder_count": 0, "kw": 0.0})
        g["loads"].append(node)
        g["feeder_count"] += len(feeders)
        g["kw"] = round(g["kw"] + node["kw"], 1)

    mapped = {(f["device_id"], f["feeder_id"])
              for fl in feeders_by_load.values() for f in fl}
    unmapped = [{"device_id": m["device_id"], "feeder_id": m["feeder_id"],
                 "feeder_name": m["feeder_name"], "role": m["role"], "section": m["section"],
                 "kw": round(kw.get((m["device_id"], m["feeder_id"]), 0.0), 1)}
                for m in db.execute(text(
                    "SELECT device_id, feeder_id, feeder_name, role, section FROM pems_meter "
                    "ORDER BY device_id, feeder_id")).mappings()
                if (m["device_id"], m["feeder_id"]) not in mapped]

    return {
        "as_of": latest.isoformat() if latest else None,
        "cost_centers": sorted(groups.values(), key=lambda g: -g["kw"]),
        "structural": structural,
        "unmapped": unmapped,
    }


def sld_tree(db: Session) -> dict:
    """Single-line-diagram feeder hierarchy (parent -> children) from pems_meter.

    Parent links are by feeder name (as captured from the SLD sheet). Roots are feeders
    whose parent is 'Parent'/blank or does not resolve to another feeder.
    """
    import re
    from datetime import timedelta
    from app.config import get_settings
    s = get_settings()
    vd = f"em_valuedata_{s.client_id.lower()}"

    def norm(x: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", (x or "").lower())).strip()

    # filtered by the main incomer so this uses the (DeviceID, FeederID, DateTimeStamp)
    # primary key index — an unfiltered MAX() over the ~20M-row table is a full scan.
    latest = db.execute(text(
        f"SELECT MAX(DateTimeStamp) FROM {vd} WHERE DeviceID=:d AND FeederID=:f"
    ), {"d": MAIN_INCOMER[0], "f": MAIN_INCOMER[1]}).scalar()
    kw: dict[tuple[str, int], float] = {}
    if latest:
        since = latest - timedelta(minutes=15)
        for r in db.execute(text(
            f"""SELECT v.DeviceID d, v.FeederID f, v.KW kw FROM {vd} v
                JOIN (SELECT DeviceID, FeederID, MAX(DateTimeStamp) ts FROM {vd}
                      WHERE DateTimeStamp>=:s GROUP BY DeviceID, FeederID) l
                  ON v.DeviceID=l.DeviceID AND v.FeederID=l.FeederID AND v.DateTimeStamp=l.ts"""
        ), {"s": since}).mappings():
            kw[(r["d"], r["f"])] = float(r["kw"] or 0)

    rows = db.execute(text(
        """SELECT mt.device_id, mt.feeder_id, mt.feeder_name, mt.parent_feeder, mt.role,
                  mt.sld_costcenter
           FROM pems_meter mt ORDER BY mt.device_id, mt.feeder_id"""
    )).mappings().all()

    # effective cost center per feeder: SLD assignment, else the mapped load's cost center
    cc_desc = {r["sap_costcenter"]: r["description"] for r in db.execute(text(
        "SELECT sap_costcenter, description FROM pems_cost_center")).mappings()}
    feeder_cc: dict[tuple[str, int], str] = {}
    for m in db.execute(text(
        """SELECT m.device_id, m.feeder_id, l.sap_costcenter
           FROM pems_load_feeder_map m JOIN pems_load l ON l.id=m.load_id
           WHERE m.effective_to IS NULL AND l.sap_costcenter IS NOT NULL AND m.coefficient > 0"""
    )).mappings():
        feeder_cc.setdefault((m["device_id"], m["feeder_id"]), m["sap_costcenter"])

    def node(r):
        key = (r["device_id"], r["feeder_id"])
        eff_cc = r["sld_costcenter"] or feeder_cc.get(key)
        return {"device_id": r["device_id"], "feeder_id": r["feeder_id"],
                "feeder_name": r["feeder_name"], "role": r["role"],
                "sld_costcenter": eff_cc, "costcenter_desc": cc_desc.get(eff_cc),
                "kw": round(kw.get(key, 0.0), 1),
                "children": []}

    nodes = {(r["device_id"], r["feeder_id"]): node(r) for r in rows}
    by_name: dict[str, tuple[str, int]] = {}
    for r in rows:
        by_name.setdefault(norm(r["feeder_name"]), (r["device_id"], r["feeder_id"]))

    roots, seen_child = [], set()
    for r in rows:
        key = (r["device_id"], r["feeder_id"])
        pnorm = norm(r["parent_feeder"]) if r["parent_feeder"] else ""
        parent_key = by_name.get(pnorm) if pnorm and pnorm != "parent" else None
        if parent_key and parent_key != key:
            nodes[parent_key]["children"].append(nodes[key])
            seen_child.add(key)
    for r in rows:
        key = (r["device_id"], r["feeder_id"])
        if key not in seen_child:
            roots.append(nodes[key])

    totals = {"loss_kw": 0.0, "panels": 0, "equipment": 0}

    def roll(n):  # subtree live kW + per-node transmission loss
        tot = n["kw"] + sum(roll(c) for c in n["children"])
        n["subtree_kw"] = round(tot, 1)
        n["descendants"] = sum(1 + c["descendants"] for c in n["children"]) if n["children"] else 0
        if n["children"]:
            child_kw = sum(c["kw"] for c in n["children"])
            loss = n["kw"] - child_kw
            n["children_kw"] = round(child_kw, 1)
            n["loss_kw"] = round(loss, 1)
            n["loss_pct"] = round(loss / n["kw"] * 100, 2) if n["kw"] else None
            if loss > 0:
                totals["loss_kw"] += loss
            totals["panels"] += 1
        else:
            n["children_kw"] = None
            n["loss_kw"] = None
            n["loss_pct"] = None
            totals["equipment"] += 1
        return tot
    for r in roots:
        roll(r)

    # Only the grid incomer(s) are true roots of the single-line diagram. Any other
    # top-level node is a feeder whose SLD parent could not be resolved (name mismatch /
    # missing SLD row) — surface these separately instead of faking them as parents.
    roots.sort(key=lambda n: (n["role"] != "grid", -n.get("subtree_kw", 0)))
    main_roots = [n for n in roots if n["role"] == "grid"]
    unlinked = [n for n in roots if n["role"] != "grid"]
    if not main_roots:                      # fallback: keep largest as root
        main_roots, unlinked = roots[:1], roots[1:]
    incoming = round(sum(r["kw"] for r in main_roots), 1)
    loss = round(totals["loss_kw"], 1)
    return {"as_of": latest.isoformat() if latest else None,
            "roots": main_roots, "unlinked": unlinked,
            "total_feeders": len(rows),
            "totals": {
                "incoming_kw": incoming,
                "transmitted_kw": round(incoming - loss, 1),
                "loss_kw": loss,
                "loss_pct": round(loss / incoming * 100, 2) if incoming else 0,
                "feeders": len(rows),
                "panels": totals["panels"],
                "equipment": totals["equipment"],
            }}


def _audit(db: Session, action: str, entity_id: str, detail: dict, actor: str | None) -> None:
    db.execute(text(
        "INSERT INTO pems_audit_log (actor, action, entity, entity_id, detail_json) "
        "VALUES (:a,:act,'load_feeder_map',:eid, CAST(:d AS JSONB))"
    ), {"a": actor or "system", "act": action, "eid": entity_id, "d": json.dumps(detail)})


def upsert_mapping(db: Session, *, load_id: int, device_id: str, feeder_id: int,
                   sign: int = 1, notes: str | None = None, actor: str | None = None) -> dict:
    """Create or update a mapping; a manual write is stored as confirmed."""
    existing = db.execute(text(
        "SELECT id FROM pems_load_feeder_map WHERE load_id=:l AND device_id=:d "
        "AND feeder_id=:f AND effective_to IS NULL"
    ), {"l": load_id, "d": device_id, "f": feeder_id}).scalar()
    if existing:
        db.execute(text(
            "UPDATE pems_load_feeder_map SET sign=:s, notes=:n, is_confirmed=true WHERE id=:id"
        ), {"s": sign, "n": notes, "id": existing})
        map_id = existing
        act = "update"
    else:
        res = db.execute(text(
            """INSERT INTO pems_load_feeder_map
                 (load_id, device_id, feeder_id, sign, is_confirmed, notes)
               VALUES (:l,:d,:f,:s,true,:n) RETURNING id"""
        ), {"l": load_id, "d": device_id, "f": feeder_id, "s": sign, "n": notes})
        map_id = res.scalar()
        act = "create"
    _audit(db, act, str(map_id),
           {"load_id": load_id, "device_id": device_id, "feeder_id": feeder_id, "sign": sign},
           actor)
    db.commit()
    return {"id": map_id, "action": act}


def confirm_mapping(db: Session, map_id: int, actor: str | None = None) -> dict:
    db.execute(text("UPDATE pems_load_feeder_map SET is_confirmed=true WHERE id=:id"),
               {"id": map_id})
    _audit(db, "confirm", str(map_id), {}, actor)
    db.commit()
    return {"id": map_id, "is_confirmed": True}


def confirm_all(db: Session, min_score: float = 0.0, actor: str | None = None) -> dict:
    n = db.execute(text(
        "UPDATE pems_load_feeder_map SET is_confirmed=true "
        "WHERE is_confirmed=false AND effective_to IS NULL AND COALESCE(match_score,0) >= :ms"
    ), {"ms": min_score}).rowcount
    _audit(db, "confirm_all", "-", {"min_score": min_score, "count": n}, actor)
    db.commit()
    return {"confirmed": n}


def delete_mapping(db: Session, map_id: int, actor: str | None = None) -> dict:
    db.execute(text("DELETE FROM pems_load_feeder_map WHERE id=:id"), {"id": map_id})
    _audit(db, "delete", str(map_id), {}, actor)
    db.commit()
    return {"id": map_id, "deleted": True}

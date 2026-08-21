"""Export the feeder hierarchy + cost sheet to a styled Excel workbook.

Sheets:
  1. Feeder Hierarchy — full parent->child tree with level, role, cost center, live kW,
     children kW and transmission loss (kW / %) per node.
  2. Cost Sheet — cost center -> load -> feeder with coefficients (the SAP formula), live kW.
  3. Cost Center Summary — energy/live-load rollup per SAP cost center.

Run:  python -m scripts.export_feeder_costsheet
Output: D:\\Projects\\PEMS\\exports\\PEMS_Feeder_CostSheet.xlsx
"""
from __future__ import annotations

import os
import re
from datetime import timedelta

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from sqlalchemy import text

from app.config import get_settings
from app.db import engine

settings = get_settings()
VD = f"em_valuedata_{settings.client_id.lower()}"
OUT_DIR = r"D:\Projects\PEMS\exports"

HEAD = Font(bold=True, color="FFFFFF")
FILL = PatternFill("solid", fgColor="1F5FBF")
FILL2 = PatternFill("solid", fgColor="2C3E56")
BOLD = Font(bold=True)
thin = Side(style="thin", color="D0D6DE")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
R = Alignment(horizontal="right")


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]", " ", (s or "").lower())).strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with engine.begin() as conn:
        latest = conn.execute(text(f"SELECT MAX(DateTimeStamp) FROM {VD}")).scalar()
        kw = {}
        if latest:
            since = latest - timedelta(minutes=15)
            for r in conn.execute(text(
                f"""SELECT v.DeviceID d, v.FeederID f, v.KW kw FROM {VD} v
                    JOIN (SELECT DeviceID, FeederID, MAX(DateTimeStamp) ts FROM {VD}
                          WHERE DateTimeStamp>=:s GROUP BY DeviceID, FeederID) l
                      ON v.DeviceID=l.DeviceID AND v.FeederID=l.FeederID AND v.DateTimeStamp=l.ts"""
            ), {"s": since}).mappings():
                kw[(r["d"], r["f"])] = float(r["kw"] or 0)

        cc_desc = {r["sap_costcenter"]: r["description"] for r in conn.execute(text(
            "SELECT sap_costcenter, description FROM pems_cost_center")).mappings()}
        feeder_cc = {}
        for m in conn.execute(text(
            """SELECT m.device_id, m.feeder_id, l.sap_costcenter FROM pems_load_feeder_map m
               JOIN pems_load l ON l.id=m.load_id
               WHERE m.effective_to IS NULL AND l.sap_costcenter IS NOT NULL AND m.coefficient>0"""
        )).mappings():
            feeder_cc.setdefault((m["device_id"], m["feeder_id"]), m["sap_costcenter"])

        meters = conn.execute(text(
            """SELECT device_id, feeder_id, feeder_name, parent_feeder, role, section, sld_costcenter
               FROM pems_meter ORDER BY device_id, feeder_id"""
        )).mappings().all()

        # build tree
        nodes = {}
        for m in meters:
            key = (m["device_id"], m["feeder_id"])
            eff = m["sld_costcenter"] or feeder_cc.get(key)
            nodes[key] = {**dict(m), "key": key, "kw": kw.get(key, 0.0),
                          "eff_cc": eff, "children": []}
        by_name = {}
        for n in nodes.values():
            by_name.setdefault(norm(n["feeder_name"]), n["key"])
        roots = []
        for n in nodes.values():
            p = norm(n["parent_feeder"]) if n["parent_feeder"] else ""
            pk = by_name.get(p) if p and p != "parent" else None
            if pk and pk != n["key"]:
                nodes[pk]["children"].append(n)
            else:
                roots.append(n)
        roots.sort(key=lambda n: (n["role"] != "grid", n["device_id"], n["feeder_id"]))

        # ---- Sheet 1: Feeder Hierarchy ----
        wb = Workbook()
        ws = wb.active
        ws.title = "Feeder Hierarchy"
        cols = ["Level", "Feeder Name", "Device/Feeder", "Parent", "Role", "Cost Center",
                "Cost Center Desc", "Live kW", "Children kW", "Loss kW", "Loss %"]
        widths = [7, 34, 14, 26, 10, 14, 22, 11, 12, 10, 9]
        for i, (c, w) in enumerate(zip(cols, widths), 1):
            cell = ws.cell(1, i, c); cell.font = HEAD; cell.fill = FILL; cell.border = BORDER
            ws.column_dimensions[chr(64 + i)].width = w

        row = [2]
        def emit(n, level):
            child_kw = sum(c["kw"] for c in n["children"])
            loss = n["kw"] - child_kw if n["children"] else None
            loss_pct = (loss / n["kw"] * 100) if (loss is not None and n["kw"]) else None
            r = row[0]
            vals = [level, n["feeder_name"], f'{n["device_id"]}/{n["feeder_id"]}',
                    n["parent_feeder"] or "", n["role"], n["eff_cc"] or "",
                    cc_desc.get(n["eff_cc"], ""), round(n["kw"], 1),
                    round(child_kw, 1) if n["children"] else None,
                    round(loss, 1) if loss is not None else None,
                    round(loss_pct, 2) if loss_pct is not None else None]
            for i, v in enumerate(vals, 1):
                cell = ws.cell(r, i, v); cell.border = BORDER
                if i >= 8: cell.alignment = R
            ws.cell(r, 2).alignment = Alignment(indent=level)
            if level == 0:
                for i in range(1, 12): ws.cell(r, i).font = BOLD
            row[0] += 1
            for c in sorted(n["children"], key=lambda x: (x["role"] != "furnace", -x["kw"])):
                emit(c, level + 1)
        for rt in roots:
            emit(rt, 0)

        # ---- Sheet 2: Cost Sheet (cost center -> load -> feeder w/ coefficient) ----
        ws2 = wb.create_sheet("Cost Sheet")
        maps = conn.execute(text(
            """SELECT l.sap_costcenter, cc.description cc_desc, l.load_code, l.load_name,
                      m.device_id, m.feeder_id, m.coefficient, mt.feeder_name
               FROM pems_load_feeder_map m
               JOIN pems_load l ON l.id=m.load_id
               JOIN pems_meter mt ON mt.device_id=m.device_id AND mt.feeder_id=m.feeder_id
               LEFT JOIN pems_cost_center cc ON cc.sap_costcenter=l.sap_costcenter
               WHERE m.effective_to IS NULL AND l.sap_costcenter IS NOT NULL
               ORDER BY l.sap_costcenter, l.display_order, m.feeder_id"""
        )).mappings().all()
        cols2 = ["Cost Center", "Cost Center Desc", "Load", "Feeder Name", "Device/Feeder",
                 "Coefficient", "Live kW"]
        widths2 = [14, 24, 20, 34, 14, 12, 11]
        for i, (c, w) in enumerate(zip(cols2, widths2), 1):
            cell = ws2.cell(1, i, c); cell.font = HEAD; cell.fill = FILL; cell.border = BORDER
            ws2.column_dimensions[chr(64 + i)].width = w
        for r, m in enumerate(maps, 2):
            vals = [m["sap_costcenter"], m["cc_desc"], m["load_name"], m["feeder_name"],
                    f'{m["device_id"]}/{m["feeder_id"]}', float(m["coefficient"]),
                    round(kw.get((m["device_id"], m["feeder_id"]), 0.0), 1)]
            for i, v in enumerate(vals, 1):
                cell = ws2.cell(r, i, v); cell.border = BORDER
                if i >= 6: cell.alignment = R

        # ---- Sheet 3: Cost Center Summary ----
        ws3 = wb.create_sheet("Cost Center Summary")
        summ = {}
        for m in maps:
            c = summ.setdefault(m["sap_costcenter"], {"desc": m["cc_desc"], "kw": 0.0, "feeders": 0})
            c["kw"] += kw.get((m["device_id"], m["feeder_id"]), 0.0) * float(m["coefficient"])
            c["feeders"] += 1
        cols3 = ["Cost Center", "Description", "Feeders", "Live kW", "Live MW"]
        for i, (c, w) in enumerate(zip(cols3, [14, 26, 10, 12, 10]), 1):
            cell = ws3.cell(1, i, c); cell.font = HEAD; cell.fill = FILL; cell.border = BORDER
            ws3.column_dimensions[chr(64 + i)].width = w
        for r, (code, c) in enumerate(sorted(summ.items(), key=lambda x: -x[1]["kw"]), 2):
            vals = [code, c["desc"], c["feeders"], round(c["kw"], 1), round(c["kw"] / 1000, 3)]
            for i, v in enumerate(vals, 1):
                cell = ws3.cell(r, i, v); cell.border = BORDER
                if i >= 3: cell.alignment = R

        for w in (ws, ws2, ws3):
            w.freeze_panes = "A2"

        path = os.path.join(OUT_DIR, "PEMS_Feeder_CostSheet.xlsx")
        wb.save(path)
        print("saved:", path)
        print(f"  feeders: {len(meters)} | cost-sheet rows: {len(maps)} | cost centers: {len(summ)}")


if __name__ == "__main__":
    main()

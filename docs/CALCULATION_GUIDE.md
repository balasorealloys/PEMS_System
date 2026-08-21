# PEMS Calculation & Operations Guide

How energy is measured, allocated to cost centers, balanced, priced, and posted to SAP in
Balasore Alloys' Power & Energy Management System. This is the authoritative reference for
every number the system produces. Sources: the plant SLD, the `EnMS→SAP` shift formula
sheet, the Energy Master, the TPNODL bill, and the OERC FY2026-27 tariff.

---

## 1. Physical layout

Power enters at **132 kV** through the **main incomer** (56 MVA contract demand, TPNODL).
From there the single-line diagram (SLD) branches down through transformers and HT panels
to ~68 feeders, metered by 5 RTUs writing 1-minute readings into `em_valuedata_ci1001`.

```
132 kV Main Incomer (DI1001/21)
├── 50 MVA-PTO ───────── Furnace-1, Furnace-2, Furnace-4, Furnace-5
├── 30 MVA-PT1
├── 30 MVA-PT2 ───────── H.T.(LT-2) ── MLDB-250kVA ── Colony
│                                    ├─ Crane, Canteen, Admin ── Guest House
├── 30 MVA-PT3 ───────── H.T.(LT-5) ── MRP, GCP F-1/F-2/F-4/F-5, Compressor-1/4
│                        H.T.(LT-1) ── Compressor-2/3, MCC-1/3, MCC-2/3
│                        H.T.(LT-3) ── Furnace-3, GCP-3 fans, MCC-3/x
│                        H.T.(LT-4) ── Pump C.T, Furnace-4/5 aux MCCs
└── H.T.(LT-6) ───────── PDB (Incomer BAL), BRQT PDB ── Briquetting plant MCCs
```

The parent→child topology matters because **some meters sit downstream of others**, so a
child's energy must be **subtracted** from its parent to avoid double counting (see §4).

The registry table `pems_meter` stores each feeder's `parent_feeder`, `sld_costcenter`,
and `role` (grid / furnace / incomer / aux).

---

## 2. Meter readings and units

Each reading row carries cumulative registers (`KWH`, `KVAH`, `KVARH`) and instantaneous
values (`KW`, `KVA`, `PF`, voltages, currents, THD).

- **Energy over a period = register at end − register at start** (a "delta").
- **⚠ Registers are not all in the same unit/scale.** The furnace-main meters read in ~MWh,
  most auxiliary meters in kWh, and the incomer PT/transformer meters in raw counts. A delta
  of *one* meter is always self-consistent, but you may only **add or subtract meters of the
  same unit** inside a formula. The shift formulas in §4 only combine like-unit auxiliary
  meters, so they are safe.
- **KW is uniform** across all meters. For cross-feeder comparisons, live dashboards, and
  ranking, PEMS integrates KW (`energy ≈ mean(KW) × hours`) instead of the mixed registers.
- The **grid (TPNODL) meter** uses a **multiplication factor MF = 480,000**: billed
  units = register delta × 480,000. This applies only to the utility meter, not sub-meters.

---

## 3. Shifts

The plant day is three 8-hour shifts. All cost-center energy is computed per shift and
summed to the day.

| Shift | From | To |
|-------|------|-----|
| **A** | 06:00 | 14:00 |
| **B** | 14:00 | 22:00 |
| **C** | 22:00 | 06:00 (next day) |

"Reading of X @ 14:00" means the `KWH` register of meter X at 14:00. Shift-A energy for a
cost center = (its meters' readings @14:00) − (@06:00), following the formula for that
cost center.

---

## 4. Cost-center energy formulas (authoritative)

Transcribed from the `EnMS→SAP` formula sheet. Each is evaluated as register deltas over a
shift (or a day/month) and posted to the SAP **cost centre** shown. `+`/`−` are the meter
coefficients PEMS stores in `pems_load_feeder_map.coefficient`.

### Directly metered
| Cost centre | Code | Formula (meters) |
|-------------|------|------------------|
| MRP / Crusher | 1100011017 | `MRP` |
| Colony | 1100013022 | `Colony` |
| Guest House | 1100013016 | `Rest H (VIP Guest House)` |
| Canteen | 1100013015 | `Canteen` |
| Crane | 1100011008 | `Crane` |
| Briquetting | 1100011023 | `PDB (Incomer BAL) LT-6` |
| Compressor-1 | 1100012003 | `55 KW - GCP Compressor 1` |
| Compressor-2 | 1100012003 | `55 KW - Compressor 2` |
| Compressor-3 | 1100012003 | `75 KW - Compressor 3` |
| Compressor-4 | 1100012003 | `75 KW - Compressor 4` |
| GCP-1 | 1100011009 | `F-1 GCP` |
| GCP-2 | 1100011009 | `F-2 GCP` |
| GCP-4 | 1100011009 | `GCP 4 ID Fan & Axcel Fan` (F-4 GCP) |
| GCP-5 | 1100011009 | `GCP 5 ID Fan & Axcel Fan` (F-5 GCP) |

### Summed (multiple meters)
| Cost centre | Code | Formula |
|-------------|------|---------|
| Pumps & Cooling Tower | 1100012002 | `MCC 1/1 F-1-2` + `MCC 2/1 F-1-2` + `MCC 3/1 F-3-4 Pump C.T` + `MCC 4-5/F-4-5 Pump C.T` |
| GCP-3 | 1100011009 | `GCP 3 ID Fan-1` + `GCP 3 ID Fan-2` + `F-3 GCP Axcel Flow Fan` |
| Furnace-3 Aux | 1100011006 | `MCC 3/3` + `F-3 Skip hoist` + `MCC 3/4 F-3 RMHS` |
| Furnace-4&5 Aux | 1100011006 | `MCC 4/2` + `MCC 5/2 (Hy Blowers)` + `Furnace 4-5 VIB Feeder` + `MCC 4-5/3 RMHS` + `MCC 4-5/4 RMCS` |

### With subtraction (nested meters) or fractional split
| Cost centre | Code | Formula |
|-------------|------|---------|
| Admin Building | 1100015020 | `Admin Building` − `Guest House` (guest house is downstream of admin) |
| Main Lighting DB | 1100011006 | `MLDB-250 kVA Trans` − `Colony` (colony is downstream of MLDB) |
| Furnace-1 Aux | 1100011006 | `MCC 1/3` + ½ × `Furnace 1-2/5 RMFS` |
| Furnace-2 Aux | 1100011006 | `MCC 2/3` + ½ × `Furnace 1-2/5 RMFS` (RMFS shared 50/50 with F-1) |
| Miscellaneous + Line loss | 1100011006 | (`H.T.(LT-5)` − its metered children) + (`H.T.(LT-1)` − its metered children) — the unaccounted remainder on those panels |

### Furnace mains (direct, separate cost centres)
| Cost centre | Code | Meter |
|-------------|------|-------|
| Furnace-1..5 | 1100011001..005 | `Furnace -1` … `Furnace -5` |

> The subtractions (Admin−GuestHouse, MainLighting−Colony) and the "Miscellaneous"
> panel-remainder exist purely because of the SLD nesting — they prevent the same kWh being
> counted under two cost centres.

---

## 5. Energy balance (Energy Master)

Monthly reconciliation of where all the energy went:

```
Grid (TPNODL, MWh)          = incomer register delta × MF, in MWh
Total Furnace Power         = Σ Furnace-1..5
Total Auxiliary Power       = Grid − Total Furnace            (residual)
   Σ Individual Loads       = MRP + Colony + … + GCP-1..5 + Furnace Aux + …
   Miscellaneous + Line loss= Auxiliary − Σ Individual Loads  (balancing figure)
```

Furnaces are ~90% of plant draw; auxiliary ~10%. This is **Module 2 (Energy Accounting)**,
which regenerates the Energy Master sheet as a system report.

---

## 6. Tariff & bill (TPNODL / OERC FY2026-27)

EHT Heavy Industry, billed on **kVAh**. See [TARIFF_FY2026-27.md](TARIFF_FY2026-27.md) for
the full schedule. Headline components of the monthly bill:

- **Energy charge** = kVAh × slab rate; slab by **load factor**: ≤60% → Rs 5.80/kVAh,
  >60% → Rs 4.70/kVAh (load factor computed on kWh).
- **ToD** (from 01.07.2026): Solar 08–16 ×0.90, Peak 18–24 ×1.10, Normal ×1.0.
- **Demand charge (MMFC)** = Rs 250 / kVA of billable demand.
- **High-load-factor rebate**: 30 paise/kVAh on units beyond 80% LF.
- **Electricity Duty** = 9% (on kWh basis), over and above tariff.
- Plus meter rent (Rs 2,000), customer service charge (Rs 700), DPS on late payment.

**Module 4 (Bill Reconciliation)** rebuilds this from meter data and compares to the actual
TPNODL bill.

---

## 7. SAP posting (Module 3)

Daily, per cost centre:

```
consumption (kWh/day)  = Σ shifts A+B+C for that cost centre (from §4 formulas)
amount (Rs)            = consumption × unit rate (Rs/kWh, from accounting / bill avg rate)
```

Posted to SAP via the OData service:

```
POST  …/ZPM_POWER_CONSUMPTION_SRV/Power_PostSet
{
  "Postingdate":       "DD.MM.YYYY",
  "Costcenter":        "1100011006",
  "Costcentredesc":    "FURNACE (COMMON)",
  "Dayunitconsunption":"10.505",
  "Dayunitrate":       "20.50",
  "Dayamount":         "205.38"
}
```

Every posting is staged in `pems_sap_posting` with a status machine
(`pending → posted → confirmed / failed`) so retries never double-post.

---

## 8. What each module replaces (100% digitalization)

| Manual artefact today | Replaced by |
|-----------------------|-------------|
| `METER WISE FEEDER ID`, SLD mapping | **Feeder Mapping** module (`pems_meter`, `pems_load_feeder_map`) |
| `Energy Master` workbook | **Energy Accounting** report + XLSX export |
| `EnMS→SAP formula` sheet + manual FB50 entry | **SAP Posting** module (formulas as data + OData) |
| `Electricity Bill` reconciliation workbook | **Bill Reconciliation** module |
| `BAL-15Min Load Pattern` | **Scheduling** module |

Every figure traces back to raw meter readings — no spreadsheet re-keying.

---

## 9. Implementation notes / caveats

- **Mixed register units** (see §2): accounting formulas only combine like-unit meters; the
  live dashboard uses KW integration. A future `pems_meter.unit_scale` column can normalise
  registers explicitly.
- **Furnace-1 meter (DI1003/98)** was not reporting in the validation window — the system
  correctly shows 0 rather than fabricating a value. Offline meters surface as gaps, not
  guesses.
- Some 2024 formula-sheet meter names differ slightly from current feeder names (e.g.
  `MCC 1/3` vs `MCC -1/3`); PEMS resolves them in the seed and flags any it cannot match for
  review in the Feeder Mapping screen.
- Mappings and coefficients are **effective-dated data**, editable in the UI — rewiring or a
  new tariff is a configuration change, not a code change.
```

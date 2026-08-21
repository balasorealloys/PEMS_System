# PEMS Architecture

## Context

Balasore Alloys draws power from TPNODL at 132 kV EHT, 56 MVA contract demand. A fleet
of 5 RTUs (`em_deviceinfo`) polls ~65 feeder meters (`em_feederinfo`) every minute and
writes readings to `em_valuedata_ci1001` (~17M rows, ~90k/day). Today, energy accounting,
bill reconciliation and SAP posting are done manually in Excel workbooks. PEMS replaces
those workbooks with a single system.

## High-level design

```
                 ┌────────────────────────────────────────────┐
   RTUs ──1min──►│  MySQL  balmpicc                             │
                 │   em_valuedata_ci1001  (read-only source)    │
                 │   em_feederinfo / em_feedergroup / ...       │
                 │   pems_*  (owned by PEMS)                    │
                 └───────────────▲──────────────┬──────────────┘
                                 │ SQLAlchemy   │
                 ┌───────────────┴──────────────▼──────────────┐
                 │  FastAPI backend                             │
                 │   routers/  (REST per module)                │
                 │   services/ energy · tariff · recon · sap    │
                 │   scheduler (APScheduler daily jobs)         │
                 └───────────────▲──────────────┬──────────────┘
                          REST/JSON             │ OData POST
                 ┌───────────────┴──────┐  ┌────▼───────────────┐
                 │  React dashboard      │  │  SAP  ZPM_POWER_   │
                 │  (Vite + TS)          │  │  CONSUMPTION_SRV   │
                 └───────────────────────┘  └────────────────────┘
```

## Key principles

1. **`em_*` is read-only.** PEMS never writes to the meter tables. All PEMS state lives
   in `pems_*` tables. This keeps the existing SCADA/EMS ingestion untouched.
2. **DB-agnostic data layer.** All access goes through SQLAlchemy so the planned move to
   Postgres (and AWS) is a connection-string change, not a rewrite. No raw
   vendor-specific SQL in application code except in versioned migrations.
3. **Consumption = register delta.** `KWH`/`KVAH` in `em_valuedata` are cumulative meter
   registers. Energy for any window = `last_reading − first_reading` in that window
   (guarding against meter resets / rollovers). `KW`/`KVA` are instantaneous.
4. **Effective-dated tariff.** Tariff rates change over time (e.g. "applicable from
   01-04-2026"). `pems_tariff` is effective-dated so historical months reconcile against
   the rates that applied then.
5. **Idempotent SAP posting.** Every posting is staged in `pems_sap_posting` with a
   status machine (`pending → posted → confirmed / failed`) so retries never double-post.

## Consumption model (the core math)

- **Feeder energy (period)** = `MAX(KWH) − MIN(KWH)` over the period for that
  `(DeviceID, FeederID)`, with reset detection.
- **Grid total** = TPNODL main-meter reading × MF (480000), taken from the grid incomer
  / entered from the bill.
- **Furnace power** = sum of FUR-1..5 feeder energy (direct metered).
- **Auxiliary power** = `Grid − Furnaces` (derived residual), then allocated to individual
  loads → SAP cost centers.
- **Load Factor** = `energy / (peak_demand × hours)`; drives the tariff slab selection
  (≤60% vs >60%).
- **TOD slots:** T1 Solar 08–16, T2 Normal 16–18, T3 Peak 18–00, T4 Normal 00–08.

See [DATA_MODEL.md](DATA_MODEL.md) for the tables and [MODULES.md](MODULES.md) for
per-module specs.

## Deployment

- **Now:** on-prem GPU server, same MySQL server as `balmpicc`, internal network reach to
  the SAP host.
- **Later:** AWS, with the database migrated to PostgreSQL (or a managed equivalent). The
  SQLAlchemy layer and env-driven config are the migration seam.

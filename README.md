# PEMS — Power & Energy Management System

Power & Energy Management System for **Balasore Alloys Ltd (BAL)** — a ferro-alloys
plant (5 submerged-arc furnaces, briquetting plant, 5 gas-cleaning plants, compressors
and utilities) drawing power from **TPNODL** on a **56 MVA / 132 kV EHT** contract demand.

PEMS gives a complete view of energy consumption across the plant, reconciles the
utility bill, allocates cost to SAP cost centers and posts it directly to SAP, and
(later) adds market analysis and load scheduling.

## Modules

| # | Module | Purpose | Status |
|---|--------|---------|--------|
| 0 | **Feeder Mapping** (master data) | Map each meter → logical load → SAP cost center; SLD tree + cost-center map; ERP-style, effective-dated | 🟢 working |
| 1 | **Executive Dashboard** | Live KPIs, plant-load flow, 24h demand, TOD, top feeders, power quality, alerts | 🟢 working |
| 2 | **Energy Accounting** | Monthly balance `Grid = Furnaces + Auxiliary`; cost-center allocation; Excel export | 🟢 working |
| 3 | **SAP Posting** | Daily cost-center consumption × rate → OData (`ZPM_POWER_CONSUMPTION_SRV`); preview/stage/post | 🟢 working (post guarded by SAP creds) |
| 4 | **Bill Reconciliation** | Rebuild the TPNODL bill from meter data (OERC tariff) and compare vs actual | 🟢 working (v1: ToD/PF/DPS pending) |
| 5 | **Scheduling** | 15-min block load pattern, TOD optimization, demand management | ⚪ planned |
| 6 | **Market Analysis** | Power-exchange / market data | ⚪ planned (last) |

### Design tenets

- **ERP-grade & dynamic** — tariff, rebates, cost centers, loads and feeder mappings are all
  **data**, edited in the UI and effective-dated. A regulation change (e.g. next year's OERC
  tariff) is a config entry, not a code change.
- **100% digitalization** — every MIS sheet currently made by hand (Energy Master, Daily Power
  Consumption, bill reconciliation) becomes a system-generated report/export.
- **Source is read-only** — PEMS never writes to the `em_*` meter tables; a governed
  `pems_meter` registry is synced from them.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.x, APScheduler
- **Frontend:** React 19 + Vite + TypeScript
- **Databases (dual-engine, both env-driven):**
  - **PostgreSQL** (schema `pems`) — all `pems_*` application tables + the synced meter
    data (`em_valuedata_*`). Source `em_*` tables are read-only; a governed `pems_meter`
    registry is synced from them.
  - **MySQL** (`balcorpdb`) — intranet single sign-on, sessions and page-view tracking only.
- **Integrations:** SAP OData (`ZPM_POWER_CONSUMPTION_SRV/Power_PostSet`)

## Repository layout

```
PEMS/
├── backend/            FastAPI application
│   ├── app/
│   │   ├── main.py         app entrypoint
│   │   ├── config.py       settings (env-driven)
│   │   ├── db.py           SQLAlchemy engine/session
│   │   ├── models/         ORM models (em_ source = read-only, pems_ = owned)
│   │   ├── routers/        API routes per module
│   │   └── services/       business logic (energy calc, tariff, SAP, recon)
│   └── requirements.txt
├── db/
│   ├── pg/             PostgreSQL schema (001) + least-privilege role (000)
│   └── migrations/     legacy MySQL DDL (historical reference)
├── docs/               architecture, data model, module specs
├── frontend/           React dashboard (built UI ships in frontend/dist)
└── .env.example        configuration template
```

## Getting started (backend)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
copy ..\.env.example ..\.env                         # then fill in DB creds
uvicorn app.main:app --reload
```

Open http://localhost:4040/docs for the API.

## Database setup (one-time)

Create the least-privilege role and the `pems` schema, then (if migrating from a
previous MySQL install) copy the data and build the rollup:

```bash
psql -h <pg-host> -U <admin> -d <db> -f db/pg/000_role.sql   # edit the password first
psql -h <pg-host> -U <admin> -d <db> -f db/pg/001_schema.sql
cd backend
export SRC_DB_URL='mysql+pymysql://<user>:<pass>@<mysql-host>:3306/<olddb>'
python scripts/migrate_mysql_to_pg.py     # copy pems_* data (idempotent)
python -m scripts.backfill_15min          # build the 15-min rollup from meter data
```

Full deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md). See
[docs/CALCULATION_GUIDE.md](docs/CALCULATION_GUIDE.md) for how every figure is computed
(shifts, cost-center formulas, energy balance, tariff, SAP posting).

## Frontend

```bash
cd frontend
npm install
npm run dev                            # proxies /api -> :4040 (dev server on :5174)
```

## Configuration

Copy `.env.example` to `.env` and fill in values. **Never commit `.env`** — it holds
live database and SAP credentials. `intro.txt` and `PEMS doc/` are also git-ignored
because they contain credentials and confidential utility bills.

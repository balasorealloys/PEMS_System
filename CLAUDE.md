# PEMS — Project Guide

Power & Energy Management System for **Balasore Alloys Ltd (BAL)** — a ferro-alloys
plant (5 submerged-arc furnaces, briquetting, 5 gas-cleaning plants, utilities) on a
**56 MVA / 132 kV EHT** TPNODL contract. PEMS monitors consumption, runs the monthly
energy balance, allocates cost to SAP cost centers and posts to SAP, and reconciles the
utility bill.

## Architecture
- **Single process:** one uvicorn process serves the API (`/api/*`) and the built React
  SPA (`/`) on one port — same-origin, so the session cookie needs no proxy/CORS.
  Entry point: `backend/run.py` (reads `APP_HOST`/`APP_PORT` from `.env`, one worker).
- **Dual database (both env-driven, never hard-coded):**
  - **PostgreSQL** — schema `pems`: all `pems_*` application tables + the synced raw
    meter data `em_valuedata_*`. Primary engine (`get_db` / `SessionLocal`).
  - **MySQL** — `balcorpdb`: intranet SSO login, sessions, page-views only. Auth engine
    (`get_auth_db` / `AuthSessionLocal`).
  - `pems_user_role` lives in Postgres, so `auth.pems_role()`/`has_role()` open their own
    primary session; anything that needs both engines (e.g. `roles.list_roles`) queries
    each and merges in Python — the two databases cannot be joined in one query.
- **Config:** everything (both DSNs, plant scope, SAP) comes from a project-root `.env`
  via `backend/app/config.py`. Changing hosts/dialects is a config change, not code.

## Conventions
- **`pems_` prefix** for all owned tables; `em_*` source tables are **read-only** (PEMS
  never writes to them). A governed `pems_meter` registry mirrors the EMS feeder list.
- **Date-effective master data** — tariff, constants, per-meter factors and feeder
  mappings all carry `effective_from`; the value in force on a date is the latest one
  on/before it. Past bills stay reproducible; a change is a new dated row, not an edit.
- **Fast reporting** reads the 15-minute rollup `pems_meter_15min` (not the ~20M-row raw
  table). A scheduler refreshes it every 15 min and catches up on startup.
- **Postgres SQL notes:** identifiers fold to lowercase (result keys come back lowercase);
  use `ON CONFLICT`, `to_char`, `date_bin`, `EXTRACT`, `COUNT(*) FILTER`, real booleans,
  and `INSERT … RETURNING` (no `lastrowid`).

## Layout
```
backend/app/{main,config,db}.py     app wiring (dual engine)
backend/app/routers/                API routes per module
backend/app/services/               business logic (accounting, rate, sap, mapping, auth, …)
backend/scripts/                     run_sql, migrate_mysql_to_pg, backfill_15min
db/pg/                               PostgreSQL role (000) + schema (001)
db/migrations/                       legacy MySQL DDL (historical)
frontend/                            React 19 + Vite + TS (built UI ships in frontend/dist)
docs/                                architecture, data model, calculation guide
```

## Running
- **Dev:** set `.env` (see `.env.example`), then `cd backend && python run.py`; open
  `http://localhost:<APP_PORT>`. Sign in with an intranet Employee ID + password.
- **Deploy:** see [DEPLOYMENT.md](DEPLOYMENT.md) (role + schema, data copy, rollup
  backfill, run as a service).

## Security (must hold in every change)
- **Never commit** `.env`, `*.bak` env files, `*.pems_secret.key`, `intro.txt`, or the
  `PEMS doc/` folder — all git-ignored. No live hosts or passwords in tracked files;
  configuration lives only in `.env`.
- PEMS connects to Postgres as a **least-privilege role** (`pems_app`), never a superuser.
- Intranet passwords are compared as SHA-1 hashes; PEMS never stores or logs plaintext.
- The SAP password is encrypted at rest (Fernet, `PEMS_SECRET_KEY`) and never returned to
  the browser. Never post to production SAP from a dev environment.

# PEMS — Deployment Guide

PEMS runs as a **single service**: one Python (uvicorn) process serves both the API
(`/api/*`) and the built React frontend (`/`) on one port. Because everything is
same-origin, the login session cookie works with no reverse proxy or CORS setup.

It uses **two databases** (both configured in `.env`, nothing hard-coded):

| Data | Engine | Notes |
|------|--------|-------|
| `pems_*` application tables + synced meter data (`em_valuedata_*`) | **PostgreSQL** | schema `pems`; primary DB |
| Intranet SSO login, sessions, page-views (`balcorpdb.*`) | **MySQL** | auth DB only |

```
        Browser ──HTTP(S)──►  uvicorn (single process)
                                 ├─ /api/*   FastAPI
                                 └─ /        React SPA (frontend/dist)
                                       │
                          ┌────────────┴─────────────┐
                          ▼                          ▼
                   PostgreSQL (pems)          MySQL (balcorpdb)
              pems_* + meter data              intranet SSO
```

---

## 0. Prerequisites
| Need | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | on PATH (`python --version`) |
| PostgreSQL | 14+ | reachable from the app host; a least-privilege role for PEMS |
| MySQL | 8 | reachable for intranet SSO (`balcorpdb`) |
| Node.js | 20 LTS | **build-time only** — to build the UI; the built `frontend/dist` ships in the repo |

The app host needs a network path to **both** databases. Outbound access to the SAP
OData host is only needed if you post to SAP from this server.

---

## 1. Get the code & Python environment
```bash
cd PEMS/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Windows;  source .venv/bin/activate on Linux
pip install -r requirements.txt
```

## 2. Configure `.env`
Copy `.env.example` to the project root as `.env` and fill in real values — this is
the **only** file you edit. It holds the Postgres (primary) and MySQL (auth) DSNs,
the app port, and the key that encrypts the saved SAP password. `.env` is never
committed.

> Use a **least-privilege** Postgres role for `DB_USER` (see step 3), never a superuser.

## 3. Database setup (first install)
Run as a Postgres **superuser / schema owner**:
```bash
# a) create the least-privilege app role (edit the password inside first)
psql -h <pg-host> -U <admin> -d <db> -f db/pg/000_role.sql
# b) create the pems_* schema/tables
psql -h <pg-host> -U <admin> -d <db> -f db/pg/001_schema.sql
```
Then, if migrating existing data from a previous MySQL install:
```bash
cd backend
export SRC_DB_URL='mysql+pymysql://<user>:<pass>@<mysql-host>:3306/<olddb>'
python scripts/migrate_mysql_to_pg.py          # copies pems_* rows (idempotent)
```
Finally build the 15-minute rollup from the meter data:
```bash
python -m scripts.backfill_15min               # full history (re-runnable)
```
The app keeps the rollup current automatically after startup (15-min scheduler).

## 4. Build the frontend (only if changed)
The built UI ships in `frontend/dist`, so this is usually unnecessary.
```bash
cd frontend
npm ci --legacy-peer-deps
npm run build
```

## 5. Run
```bash
cd backend
python run.py            # binds APP_HOST:APP_PORT from .env, single worker
```
Open `http://<server>:<APP_PORT>` and sign in with an intranet Employee ID + password.

> One worker only — the app runs an internal 15-minute rollup scheduler that must not
> be duplicated. To change the port, edit `APP_PORT` in `.env` and restart.

## 6. Run as a service (Windows / NSSM)
```powershell
nssm install PEMS "C:\PEMS\backend\.venv\Scripts\python.exe" "run.py"
nssm set PEMS AppDirectory C:\PEMS\backend
nssm set PEMS Start SERVICE_AUTO_START
nssm start PEMS
```
The service command has **no port in it** — the port comes from `.env`.

## 7. Firewall / reverse proxy
Allow the app port inbound. Optionally front it with IIS/nginx for :80/:443 + TLS,
proxying all traffic (SPA + `/api`) to the uvicorn port.

---

## 8. Updating to a new release
```bash
git pull
cd backend && pip install -r requirements.txt
cd ../frontend && npm ci --legacy-peer-deps && npm run build   # only if UI changed
# apply any new db/pg/*.sql, then restart the service
```

## 9. Troubleshooting
- `GET /api/health` → `{"status":"ok"}` means the API is up.
- Blank page / JSON at `/` → `frontend/dist` missing; build it (step 4) and restart.
- Login always fails → the app host can't reach the MySQL auth DB, or the DB user
  can't read `balcorpdb.intranet_user_login`.
- Data looks stale → the rollup refreshes every 15 min; check the log for the
  "rollup scheduler" messages.

**Never commit** `.env`, `*.bak` env files, encryption keys (`*.pems_secret.key`), or
any file containing live hosts/passwords. Configuration lives only in `.env`.

# PEMS Data Model

## Source tables (read-only, existing — `em_*`)

| Table | Rows | Role |
|-------|------|------|
| `em_valuedata_ci1001` | ~17M | 1-min meter readings. PK `(DeviceID, FeederID, DateTimeStamp)`. Cumulative `KWH/KVAH/KVARH`; instantaneous `KW/KVA/KVAR/AMPS/VLN/VLL/PF/FREQ/THD`. |
| `em_deviceinfo` | 5 | RTU devices (DI1001–DI1005). |
| `em_feederinfo` | 68 | Feeder master: `DeviceID, FeederID, FeederName`, max ranges, `IsEnabled`, `IsVirtualFeeder`. |
| `em_incomerinfo` | 7 | Which feeders are incomers. |
| `em_feedergroup` | 10 | Feeder groups (F/C-1..4, GCP, Utility, Briquetting, virtual "15-min Block"). |
| `em_mapfeedergroup` | 88 | Feeder → group mapping (many-to-many). |

Composite meter key across the system: `(ClientID, PlantID, DeviceID, FeederID)`,
scoped by `CLIENT_ID=CI1001`, `PLANT_ID=PI1001`.

## PEMS tables (owned — `pems_*`)

All prefixed `pems_`, created by `db/migrations/001_pems_core.sql`.

### Masters & config
- **`pems_cost_center`** — SAP cost-center master: `sap_costcenter` (e.g. 1100011006),
  `description` (FURNACE (COMMON)), `category`, `is_active`.
- **`pems_load`** — logical loads for accounting (MRP, Colony, GCP-1.., Furnace-1..,
  Compressor-1..). Maps a load to a `sap_costcenter`.
- **`pems_load_feeder_map`** — which meter feeders `(DeviceID, FeederID)` sum into a load;
  supports `sign` (+/−) for derived/virtual loads.
- **`pems_tariff`** — effective-dated tariff config: energy slab rates by load factor
  band & voltage (EHT/HT), TOD multipliers, demand charge/MMFC, PF penalty/incentive
  bands, electricity-duty %, meter rent, customer service charge, colony rate.
- **`pems_config`** — key/value app config (grid MF, contract demand, thresholds).

### Transactions & computed
- **`pems_meter_snapshot`** — daily/period register snapshots per feeder (initial/final
  KWH/KVAH) for delta-based consumption; audit trail of the numbers used.
- **`pems_daily_consumption`** — computed daily kWh/kVAh per load & cost center.
- **`pems_energy_balance`** — monthly balance: grid total, total furnace, total auxiliary,
  and per-load allocation.
- **`pems_sap_posting`** — SAP posting queue/log: `posting_date, sap_costcenter,
  costcenter_desc, consumption, unit_rate, amount, status, sap_doc_no, request_json,
  response_json, posted_at`. Status: `pending|posted|confirmed|failed`.
- **`pems_bill_actual`** — parsed TPNODL bill values per bill month (energy charge, demand
  charge, ED, TOD, PF, DPS, net payable, meter readings by TOD slot).
- **`pems_bill_recon`** — PEMS-computed bill vs `pems_bill_actual`, line-by-line variance.
- **`pems_audit_log`** — who/what/when for PEMS actions (esp. SAP posts and recon sign-off).

## Consumption query pattern

```sql
-- energy for a feeder over a window (delta of cumulative register)
SELECT MAX(KWH) - MIN(KWH) AS kwh
FROM   em_valuedata_ci1001
WHERE  DeviceID = :dev AND FeederID = :fdr
  AND  DateTimeStamp >= :start AND DateTimeStamp < :end;
```

Reset/rollover handling and virtual (summed) feeders are done in
`services/energy.py`, not in SQL, to stay DB-portable.

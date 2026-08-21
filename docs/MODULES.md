# PEMS Module Specs

Build order: 1 → 2 → 3 → 4 → 5, with **6 (Market Analysis) last** per project direction.

## 1. Energy Monitoring ("Complete View")
Live and historical visibility from `em_valuedata_ci1001`.
- Plant overview: current total load (MW), today's kWh/kVAh, PF, running demand vs 56 MVA.
- Feeder & group drilldown: KW/KVA/PF trends, load curves.
- 15-min demand blocks vs contract demand (overdrawal watch).
- Section/area consumption (by device location & feeder group).
- APIs: `/api/live/overview`, `/api/feeders`, `/api/groups`, `/api/trend`.

## 2. Energy Accounting
Reproduces `Energy Master`.
- Monthly balance: `Grid = Furnaces + Auxiliary`; auxiliary = residual.
- Allocate auxiliary to loads → cost centers; produce the consumption report.
- Handles meter MF (grid ×480000) and unit conversions (kWh/MWh).
- APIs: `/api/accounting/balance`, `/api/accounting/loads`.

## 3. SAP Posting
Reproduces `Power Auxiliary Power.xlsx` + the OData integration.
- Compute daily per-cost-center consumption × unit rate = amount.
- Stage in `pems_sap_posting`; POST to
  `ZPM_POWER_CONSUMPTION_SRV/Power_PostSet` with payload
  `{Postingdate, Costcenter, Costcentredesc, Dayunitconsunption, Dayunitrate, Dayamount}`.
- Idempotent status machine; retry/failure handling; audit log.
- APIs: `/api/sap/preview`, `/api/sap/post`, `/api/sap/status`.

## 4. Bill Reconciliation
Reproduces `ELECTRICITY BILS-BAL-FY25-26`.
- Rebuild the TPNODL bill from meter data using `pems_tariff`:
  energy charge (KVAH × slab by load factor), TOD incentive/surcharge, demand
  charge/MMFC, overdrawal penalty, PF penalty/incentive, colony KVAH charge,
  load-factor rebate, electricity duty 9%, meter rent, CSC, DPS.
- Compare computed vs actual bill; flag variances for sign-off.
- APIs: `/api/recon/compute`, `/api/recon/compare`.

## 5. Scheduling
From `BAL-15Min Load Pattern`.
- 15-min block load pattern, TOD-aware load planning, demand management vs 56 MVA.

## 6. Market Analysis (last)
Power-exchange / market price data and analysis. Deferred until modules 1–5 are stable.

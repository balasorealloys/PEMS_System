# OERC Retail Supply Tariff — FY 2026-27

**Source:** Odisha Electricity Regulatory Commission (OERC) Retail Supply Tariff
Notification, common Order dated **24.03.2026**, Case Nos. 124–127/2025 (TPNODL).
**Effective:** 01.04.2026 (ToD provisions from **01.07.2026**). Applies to TPNODL area,
which supplies **Balasore Alloys Ltd**.

This is the regulatory basis for **Module 4 (Bill Reconciliation)** and the `pems_tariff`
table. It confirms the numbers already seen in the TPNODL bill and the reconciliation
workbook. (Original PDF: `PEMS doc/DISCOMs_Tariff_Notification_FY_2026-27.pdf`, git-ignored.)

## What applies to BAL (EHT, Heavy / Large Industry, 132 kV, 56 MVA CD)

| Parameter | Value |
|---|---|
| Billing basis | **kVAh** (HT & EHT billed on kVAh drawal) |
| Demand charge (MMFC) | **Rs. 250 / kVA / month** |
| Customer service charge | **Rs. 700 / month** |
| Energy charge — Load Factor ≤ 60% | **580 paise/kVAh = Rs. 5.80** |
| Energy charge — Load Factor > 60% | **470 paise/kVAh = Rs. 4.70** |
| Electricity Duty (ED) | **9%**, levied by Govt. of Odisha *over and above* tariff (Odisha Electricity (Duty) Act, 1961); ED computed on **kWh** basis |
| Colony consumption (EHT) | 485 paise/kVAh = Rs. 4.85 |
| Meter rent (3-ph HT CT / Smart HT CT, 33 kV) | Rs. 2000/month (collected over 60 months) |

> Slab selection uses **load factor computed on kWh** (rule i). Energy charge itself is on kVAh.

## Energy-charge slab table (Paise/kVAh)

| Load Factor | HT | EHT |
|---|---|---|
| ≤ 60% | 585.00 | **580.00** |
| > 60% | 475.00 | **470.00** |

## Rebates / surcharges relevant to BAL (EHT industry)

- **(iii) High-load-factor rebate:** EHT industrial consumers get **30 paise/kVAh rebate
  on all units consumed beyond 80% load factor**. → drives the "Load Factor Rebate /
  Special Discount" line in the bill.
- **(x) Overdrawal:** drawal up to **120% of Contract Demand** allowed in **Normal & Solar
  hours** without penalty. Overdrawal penalty applies only above 120% CD. Drawal beyond CD
  during **Peak hours is not eligible** for this relief. If statutory load regulation is
  imposed, the restricted demand is treated as CD.
- **(ii) Steel-plant LF rebate** (HT, CGP-less, CD ≥ 1 MVA): tiered 8–20% on energy charge
  by load factor band — *not* BAL's category (BAL is EHT arc-furnace ferro-alloys), noted
  for completeness.

## Time-of-Day (ToD) tariff — effective 01.07.2026 (rule ix)

Applies to all consumers with smart/AMR meters and **CD > 10 kW** (except irrigation).

| Period | Hours | ToD multiplier on normal tariff |
|---|---|---|
| **Solar** | 08:00 – 16:00 | **0.90** (10% less) |
| **Normal** | 16:00 – 18:00 | 1.00 (no ToD) |
| **Peak** | 18:00 – 00:00 | **1.10** (1.1×) |
| **Normal** | 00:00 – 08:00 | 1.00 (no ToD) |

These are exactly the T1 Solar / T2 Normal / T3 Peak / T4 Normal slots in the bill and
recon workbook. The ToD incentive (Solar) and surcharge (Peak) apply on the energy charge.

## Delayed Payment Surcharge (DPS)

- Notification rule (v) re-introduces DPS **@1% simple interest per month** specifically for
  *LT General Purpose (CD ≥ 5 kW)* and *HT Bulk Supply Domestic* consumers, computed on the
  unpaid amount excluding Electricity Duty and DPS arrears.
- **Note:** the actual TPNODL bill for BAL computes DPS at **1.25%/month** (see the May-2026
  bill). The rate that governs EHT industry DPS comes from the detailed OERC order / supply
  code, not this summary clause — reconcile the DPS rate against the live bill, not this rule.

## Other charges (reference)

- **(xvii)** Temporary connection: energy charges 10% higher.
- **(xvi)** Reconnection charge — All EHT consumers: Rs. 10,000 (waived for smart meters
  unless disconnection was due to meter tampering).
- **(xviii)** Meter rent table; 33 kV HT CT meter = Rs. 2000/month over 60 months.

## Reconciliation implications (for `pems_tariff` seeding, EHT effective 2026-04-01)

```
voltage_class          = EHT
effective_from         = 2026-04-01
slab_lf_low_rate        = 5.80    (Rs/kVAh, LF <= 60%)
slab_lf_high_rate       = 4.70    (Rs/kVAh, LF > 60%)
lf_threshold_pct        = 60
demand_charge           = 250     (Rs/kVA/month)
customer_service_charge = 700
electricity_duty_pct    = 9.0
meter_rent              = 2000
colony_rate             = 4.85
tod_rates_json          = {"solar":0.90,"normal":1.00,"peak":1.10}  # effective 2026-07-01
extras_json             = {"eht_hlf_rebate_paise_per_kvah": 30, "hlf_rebate_lf_threshold_pct": 80,
                           "overdrawal_cd_allowance_pct": 120}
```

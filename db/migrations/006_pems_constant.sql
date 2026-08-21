-- Date-effective operational constants.
-- Values that used to be hard-coded in the rate / accounting engines now live here,
-- versioned by effective_from so a change (e.g. a new meter factor or contract demand)
-- applies only from its date forward and history stays reproducible.

CREATE TABLE IF NOT EXISTS pems_constant (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ckey           VARCHAR(64)  NOT NULL,
  label          VARCHAR(120) NOT NULL,
  category       VARCHAR(40)  NOT NULL DEFAULT 'General',
  unit           VARCHAR(24)  NULL,
  cvalue         DECIMAL(18,6) NOT NULL,
  effective_from DATE         NOT NULL,
  note           VARCHAR(255) NULL,
  updated_by     VARCHAR(80)  NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_key_from (ckey, effective_from),
  KEY idx_key_date (ckey, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the current values, effective from the start of FY2026-27.
INSERT INTO pems_constant (ckey, label, category, unit, cvalue, effective_from, note, updated_by)
VALUES
  ('meter_mult_factor',    'Meter multiplication factor',  'Metering',    '×',        1.010000, '2026-04-01', 'Plant grossing factor from the BAL 15-min load-pattern formula (register delta x 1.01).', 'seed'),
  ('contract_demand_kva',  'Contract demand',              'Demand',      'kVA',  56000.000000, '2026-04-01', 'TPNODL sanctioned contract demand.', 'seed'),
  ('mmfc_floor_pct',       'MMFC billing-demand floor',    'Demand',      '%',       80.000000, '2026-04-01', 'Billing demand floored at this % of contract demand.', 'seed'),
  ('tod_peak_adder',       'ToD peak surcharge',           'Time of Day', '₹/kVAh',   0.300000, '2026-04-01', 'Added per kVAh consumed in the peak window (18:00-24:00).', 'seed'),
  ('tod_solar_incentive',  'ToD solar incentive',          'Time of Day', '₹/kVAh',   0.200000, '2026-04-01', 'Rebated per kVAh consumed in the solar window (08:00-16:00).', 'seed')
ON DUPLICATE KEY UPDATE cvalue = VALUES(cvalue);

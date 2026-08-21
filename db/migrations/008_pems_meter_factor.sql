-- Per-meter (per-feeder) multiplication factor overrides.
-- The plant's grossing factor is NOT uniform: each meter has its own factor
-- (e.g. Furnace-1 ×1.0097, Furnace-2 ×1.012) from the 15-min load-pattern
-- workbook. A feeder listed here uses its own factor; any feeder not listed
-- falls back to the global `meter_mult_factor` constant (1.01).

CREATE TABLE IF NOT EXISTS pems_meter_factor (
  device_id    VARCHAR(6)   NOT NULL,
  feeder_id    SMALLINT     NOT NULL,
  mult_factor  DECIMAL(9,6) NOT NULL,
  note         VARCHAR(255) NULL,
  updated_by   VARCHAR(80)  NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id, feeder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;  -- match pems_meter for JOINs

INSERT INTO pems_meter_factor (device_id, feeder_id, mult_factor, note, updated_by)
VALUES
  ('DI1003', 98, 1.009700, 'Furnace-1 — per load-pattern workbook', 'seed'),
  ('DI1003', 51, 1.012000, 'Furnace-2 — per load-pattern workbook', 'seed')
ON DUPLICATE KEY UPDATE mult_factor = VALUES(mult_factor);

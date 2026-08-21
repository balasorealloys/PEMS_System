-- Make per-meter multiplication factors date-effective, like pems_constant.
-- A meter can have several factor versions; the one in force on a given date is
-- the latest whose effective_from <= that date. Past accounting stays reproducible.

ALTER TABLE pems_meter_factor
  ADD COLUMN effective_from DATE NOT NULL DEFAULT '2026-04-01' AFTER feeder_id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (device_id, feeder_id, effective_from);

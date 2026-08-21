-- Collapse the messy per-meter factor history to a single FY-start baseline.
--
-- Earlier testing through the UI left stray x1.0 versions (effective 2025-01-01,
-- 2025-07-25 and 2026-07-25) sitting AFTER the real grossing factors (effective
-- 2026-04-01). Because the date-effective rule takes the latest effective_from
-- on/before the asked date, those trailing x1.0 rows shadowed the real factors,
-- so every furnace was grossed at x1.0 and edits made at an earlier effective
-- date never surfaced ("updating but not getting changed").
--
-- Keep only the real factor for each meter, effective the FY start (01 Apr 2026).
DELETE FROM pems_meter_factor WHERE effective_from <> '2026-04-01';

-- Global default grossing factor: x1.0 from the FY start. Per-meter overrides
-- carry the real furnace factors, and every other meter measures directly.
DELETE FROM pems_constant WHERE ckey = 'meter_mult_factor' AND effective_from <> '2026-04-01';
UPDATE pems_constant SET cvalue = 1.000000
  WHERE ckey = 'meter_mult_factor' AND effective_from = '2026-04-01';

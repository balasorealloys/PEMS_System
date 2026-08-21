-- Make the Time-of-Day windows configurable instead of hard-coded in the engine.
-- Peak / solar window boundaries (hour of day, 0–24) and a normal-period adder
-- (₹0 by default — normal is the base rate) are now date-effective constants,
-- so they show up editable in Settings → Constants → Time of Day.

INSERT INTO pems_constant (ckey, label, category, unit, cvalue, effective_from, note, updated_by)
VALUES
  ('tod_peak_start_hr',  'Peak window — start hour',  'Time of Day', 'h',       18.000000, '2026-04-01', 'Peak ToD window begins at this hour.', 'seed'),
  ('tod_peak_end_hr',    'Peak window — end hour',    'Time of Day', 'h',       24.000000, '2026-04-01', 'Peak ToD window ends at this hour (24 = midnight).', 'seed'),
  ('tod_solar_start_hr', 'Solar window — start hour', 'Time of Day', 'h',        8.000000, '2026-04-01', 'Solar ToD window begins at this hour.', 'seed'),
  ('tod_solar_end_hr',   'Solar window — end hour',   'Time of Day', 'h',       16.000000, '2026-04-01', 'Solar ToD window ends at this hour.', 'seed'),
  ('tod_normal_adder',   'ToD normal adder',          'Time of Day', '₹/kVAh',   0.000000, '2026-04-01', 'Normal period (all hours outside solar and peak) — base rate, no surcharge or rebate.', 'seed')
ON DUPLICATE KEY UPDATE cvalue = VALUES(cvalue);

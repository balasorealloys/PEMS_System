-- Carry the kWh/kVAh meter registers in the 15-min rollup so energy can be
-- computed from register deltas (gap-robust, matches the plant Energy Master)
-- instead of integrating instantaneous KW (which under-counts on data gaps).
ALTER TABLE pems_meter_15min
  ADD COLUMN kwh  DECIMAL(19,3) NULL AFTER max_kva,
  ADD COLUMN kvah DECIMAL(19,3) NULL AFTER kwh;

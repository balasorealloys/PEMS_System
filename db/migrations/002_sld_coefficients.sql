-- Authoritative mapping support: coefficients (for sums, subtractions and fractional
-- splits like the RMFS 50/50 share) and SLD hierarchy/cost-center on the meter registry.

ALTER TABLE pems_load_feeder_map
    ADD COLUMN coefficient DECIMAL(6,3) NOT NULL DEFAULT 1.000 AFTER sign;

ALTER TABLE pems_meter
    ADD COLUMN parent_feeder  VARCHAR(80) AFTER feeder_location,
    ADD COLUMN sld_costcenter VARCHAR(20) AFTER parent_feeder;

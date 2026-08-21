-- Pre-aggregated 15-minute rollup of the raw meter data (em_valuedata_*).
-- One row per feeder per 15-min block: average kW / kVA (the standard demand block)
-- and the block max. Heavy reports read this small table instead of scanning ~17M raw rows.
--   energy(kWh) over a period = SUM(avg_kw) * 0.25   (each block = 0.25 h)
--   max demand (kVA)          = MAX(avg_kva)          (15-min block demand, per tariff)

CREATE TABLE IF NOT EXISTS pems_meter_15min (
    device_id   VARCHAR(6)  NOT NULL,
    feeder_id   SMALLINT    NOT NULL,
    block_start DATETIME    NOT NULL,           -- floor of the reading time to 15 min
    avg_kw      DECIMAL(12,2),
    avg_kva     DECIMAL(12,2),
    max_kw      DECIMAL(12,2),
    max_kva     DECIMAL(12,2),
    samples     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, feeder_id, block_start),
    KEY idx_15min_block (block_start),
    KEY idx_15min_feeder_block (device_id, feeder_id, block_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks how far the rollup has been populated (for incremental updates).
CREATE TABLE IF NOT EXISTS pems_rollup_state (
    rollup_key  VARCHAR(40) PRIMARY KEY,
    last_block  DATETIME,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- PEMS core schema — all tables prefixed pems_ (source em_ tables are read-only).
-- Target: MySQL 8 (balmpicc). Written to port cleanly to PostgreSQL later.
--
-- Design principles (ERP-grade, dynamic):
--   * Master data (cost centers, loads, meters, mappings, tariff) is DATA, edited via the
--     UI and effective-dated -- a regulation/reorg change is a config entry, not a code change.
--   * pems_meter is a governed registry synced FROM the read-only em_feederinfo; PEMS never
--     writes to em_*.
--   * Every mapping/tariff carries effective_from/effective_to so historical months are
--     computed against the master data that applied then.

-- ===========================================================================
-- MASTER DATA
-- ===========================================================================

-- SAP cost-center master.
CREATE TABLE IF NOT EXISTS pems_cost_center (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    sap_costcenter  VARCHAR(20)  NOT NULL UNIQUE,
    description     VARCHAR(100) NOT NULL,
    category        VARCHAR(40),
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Governed meter/feeder registry, synced from em_feederinfo + em_deviceinfo.
-- Adds PEMS-only classification (section, role) used for accounting & display.
CREATE TABLE IF NOT EXISTS pems_meter (
    device_id       VARCHAR(6)  NOT NULL,
    feeder_id       SMALLINT    NOT NULL,
    client_id       VARCHAR(6)  NOT NULL DEFAULT 'CI1001',
    plant_id        VARCHAR(6)  NOT NULL DEFAULT 'PI1001',
    device_name     VARCHAR(50),
    feeder_name     VARCHAR(80),
    feeder_location VARCHAR(40),
    section         VARCHAR(40),                          -- PEMS grouping (Furnace/GCP/Utility/...)
    role            VARCHAR(15)  NOT NULL DEFAULT 'unknown', -- grid | furnace | aux | incomer | unknown
    is_incomer      TINYINT(1)   NOT NULL DEFAULT 0,
    is_enabled      TINYINT(1)   NOT NULL DEFAULT 1,        -- mirrors em_feederinfo.IsEnabled
    is_virtual      TINYINT(1)   NOT NULL DEFAULT 0,
    display_order   INT,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,        -- tracked in PEMS
    synced_at       DATETIME,
    PRIMARY KEY (device_id, feeder_id)
);

-- Logical loads for energy accounting (FUR-1..5, GCP-1..5, Colony, Compressors, ...).
-- Many loads may share a cost center (e.g. all compressors -> AIR SYSTEM).
CREATE TABLE IF NOT EXISTS pems_load (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    load_code       VARCHAR(30)  NOT NULL UNIQUE,
    load_name       VARCHAR(80)  NOT NULL,
    sap_costcenter  VARCHAR(20),
    section         VARCHAR(40),
    load_type       VARCHAR(20)  NOT NULL DEFAULT 'aux',   -- grid | furnace | aux | individual
    is_derived      TINYINT(1)   NOT NULL DEFAULT 0,        -- residual/computed (e.g. Auxiliary = Grid - Furnace)
    display_order   INT,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_load_cc FOREIGN KEY (sap_costcenter)
        REFERENCES pems_cost_center (sap_costcenter)
);

-- Feeder -> load assignment, effective-dated, with a confirmation workflow.
-- sign supports derived loads (+1 add, -1 subtract).
CREATE TABLE IF NOT EXISTS pems_load_feeder_map (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    load_id         INT NOT NULL,
    device_id       VARCHAR(6)  NOT NULL,
    feeder_id       SMALLINT    NOT NULL,
    sign            TINYINT     NOT NULL DEFAULT 1,
    effective_from  DATE        NOT NULL DEFAULT '2000-01-01',
    effective_to    DATE,                                  -- NULL = open
    is_confirmed    TINYINT(1)  NOT NULL DEFAULT 0,         -- 0 = auto-suggested, awaiting review
    match_score     DECIMAL(5,2),                          -- confidence of auto-match (0-100)
    notes           VARCHAR(255),
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lfm_load  FOREIGN KEY (load_id) REFERENCES pems_load (id),
    CONSTRAINT fk_lfm_meter FOREIGN KEY (device_id, feeder_id)
        REFERENCES pems_meter (device_id, feeder_id),
    UNIQUE KEY uq_lfm (load_id, device_id, feeder_id, effective_from)
);

-- Versioned, effective-dated tariff plan. Rate detail as JSON so the schema survives
-- tariff-structure changes without migrations (dynamic per OERC order).
CREATE TABLE IF NOT EXISTS pems_tariff (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(60),                       -- e.g. 'OERC FY2026-27'
    tariff_order_ref    VARCHAR(120),                      -- OERC order / case reference
    voltage_class       VARCHAR(10)  NOT NULL DEFAULT 'EHT', -- EHT | HT | LT
    consumer_category   VARCHAR(40)  NOT NULL DEFAULT 'Heavy Industry',
    effective_from      DATE         NOT NULL,
    effective_to        DATE,
    status              VARCHAR(10)  NOT NULL DEFAULT 'active', -- draft | active | superseded
    slab_lf_low_rate    DECIMAL(9,4),   -- Rs/kVAh when load factor <= threshold
    slab_lf_high_rate   DECIMAL(9,4),   -- Rs/kVAh when load factor > threshold
    lf_threshold_pct    DECIMAL(5,2)  NOT NULL DEFAULT 60.00,
    demand_charge       DECIMAL(9,2),   -- Rs per kVA/month (MMFC)
    electricity_duty_pct DECIMAL(5,2) NOT NULL DEFAULT 9.00,
    meter_rent          DECIMAL(9,2)  NOT NULL DEFAULT 2000,
    customer_service_charge DECIMAL(9,2) NOT NULL DEFAULT 700,
    colony_rate         DECIMAL(9,4),
    tod_rates_json      JSON,           -- {"solar":0.90,"normal":1.00,"peak":1.10,"windows":{...}}
    pf_bands_json       JSON,           -- PF penalty/incentive bands
    rebates_json        JSON,           -- e.g. {"eht_hlf_rebate_paise":30,"hlf_threshold_pct":80}
    extras_json         JSON,
    notes               VARCHAR(255),
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tariff (voltage_class, consumer_category, effective_from)
);

-- Generic key/value app config (grid MF, contract demand, plant scope, thresholds).
CREATE TABLE IF NOT EXISTS pems_config (
    cfg_key     VARCHAR(60) PRIMARY KEY,
    cfg_value   VARCHAR(255) NOT NULL,
    data_type   VARCHAR(15)  NOT NULL DEFAULT 'string',    -- string | int | float | bool | json
    description VARCHAR(255),
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ===========================================================================
-- TRANSACTIONS & COMPUTED
-- ===========================================================================

CREATE TABLE IF NOT EXISTS pems_meter_snapshot (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id       VARCHAR(6)  NOT NULL,
    feeder_id       SMALLINT    NOT NULL,
    period_start    DATETIME    NOT NULL,
    period_end      DATETIME    NOT NULL,
    kwh_initial     DECIMAL(19,2),
    kwh_final       DECIMAL(19,2),
    kvah_initial    DECIMAL(19,2),
    kvah_final      DECIMAL(19,2),
    kwh_delta       DECIMAL(19,2),
    kvah_delta      DECIMAL(19,2),
    had_reset       TINYINT(1)  NOT NULL DEFAULT 0,
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_snap (device_id, feeder_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS pems_daily_consumption (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    consumption_date DATE       NOT NULL,
    load_id         INT,
    sap_costcenter  VARCHAR(20),
    kwh             DECIMAL(19,3),
    kvah            DECIMAL(19,3),
    source          VARCHAR(20) NOT NULL DEFAULT 'computed',
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dc_load FOREIGN KEY (load_id) REFERENCES pems_load (id),
    UNIQUE KEY uq_dc (consumption_date, load_id)
);

CREATE TABLE IF NOT EXISTS pems_energy_balance (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    balance_month       CHAR(7) NOT NULL,   -- 'YYYY-MM'
    grid_mwh            DECIMAL(19,4),
    grid_mvah           DECIMAL(19,4),
    furnace_mwh         DECIMAL(19,4),
    auxiliary_mwh       DECIMAL(19,4),
    detail_json         JSON,               -- per-load allocation
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bal (balance_month)
);

CREATE TABLE IF NOT EXISTS pems_sap_posting (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    posting_date    DATE         NOT NULL,
    sap_costcenter  VARCHAR(20)  NOT NULL,
    costcenter_desc VARCHAR(100),
    consumption     DECIMAL(19,3) NOT NULL,
    unit_rate       DECIMAL(12,4),
    amount          DECIMAL(19,2),
    status          VARCHAR(12)  NOT NULL DEFAULT 'pending', -- pending|posted|confirmed|failed
    sap_doc_no      VARCHAR(30),
    request_json    JSON,
    response_json   JSON,
    error_msg       VARCHAR(500),
    posted_at       DATETIME,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_post (posting_date, sap_costcenter)
);

CREATE TABLE IF NOT EXISTS pems_bill_actual (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    bill_month      CHAR(7) NOT NULL,       -- 'YYYY-MM'
    consumer_ac     VARCHAR(20),
    bill_no         VARCHAR(40),
    contract_demand_kva INT,
    billable_demand_kva DECIMAL(12,2),
    power_factor    DECIMAL(6,4),
    load_factor_pct DECIMAL(6,2),
    kwh_total       DECIMAL(19,2),
    kvah_total      DECIMAL(19,2),
    energy_charge   DECIMAL(19,2),
    demand_charge   DECIMAL(19,2),
    tod_charge      DECIMAL(19,2),
    pf_charge       DECIMAL(19,2),
    electricity_duty DECIMAL(19,2),
    dps             DECIMAL(19,2),
    net_payable     DECIMAL(19,2),
    detail_json     JSON,
    UNIQUE KEY uq_bill (bill_month)
);

CREATE TABLE IF NOT EXISTS pems_bill_recon (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    bill_month      CHAR(7) NOT NULL,
    component       VARCHAR(60) NOT NULL,   -- energy_charge, demand_charge, ...
    computed_value  DECIMAL(19,2),
    actual_value    DECIMAL(19,2),
    variance        DECIMAL(19,2),
    variance_pct    DECIMAL(9,4),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_recon (bill_month, component)
);

CREATE TABLE IF NOT EXISTS pems_audit_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor       VARCHAR(80),
    action      VARCHAR(60)  NOT NULL,
    entity      VARCHAR(60),
    entity_id   VARCHAR(60),
    detail_json JSON,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

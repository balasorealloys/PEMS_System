-- Change log for configuration edits (constants, tariff, system config).
-- Every edit made through System Settings is recorded here: what changed, the
-- human-readable detail, when it takes effect, and who made it.

CREATE TABLE IF NOT EXISTS pems_audit (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  entity         VARCHAR(24)  NOT NULL,           -- 'constant' | 'tariff' | 'system'
  entity_key     VARCHAR(80)  NOT NULL,           -- ckey / tariff name / cfg_key
  action         VARCHAR(16)  NOT NULL,           -- 'create' | 'update' | 'delete'
  detail         VARCHAR(500) NULL,               -- human-readable summary of the change
  effective_from DATE         NULL,               -- when the changed value takes effect (if dated)
  changed_by     VARCHAR(80)  NULL,
  changed_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_changed_at (changed_at),
  KEY idx_entity (entity, entity_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

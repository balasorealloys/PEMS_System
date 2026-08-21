-- PEMS-specific access roles (separate from the intranet directory).
-- Everyone with an intranet login can sign in; this table decides what they can DO
-- inside PEMS. A user with no row here defaults to 'viewer' (read-only).
--   admin   — full access incl. System Settings, tariff/constants, user roles
--   manager — operational writes (SAP posting, bill entry, feeder mapping) + all views
--   viewer  — read-only

CREATE TABLE IF NOT EXISTS pems_user_role (
  emp_id      VARCHAR(10)  NOT NULL,
  role        VARCHAR(16)  NOT NULL DEFAULT 'viewer',
  granted_by  VARCHAR(80)  NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pems_user_role (emp_id, role, granted_by)
VALUES ('3101', 'admin', 'seed')
ON DUPLICATE KEY UPDATE role = VALUES(role);

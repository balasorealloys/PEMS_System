-- Least-privilege application role for PEMS (run as a superuser, e.g. enterprise).
-- PEMS connects as this role — NEVER as the DB superuser.
--
-- Replace the password below before running, and use the SAME value in .env (DB_PASS).
-- Re-runnable: it only (re)grants; drop the CREATE ROLE line if the role already exists.

CREATE ROLE pems_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';

GRANT CONNECT ON DATABASE corpappdb TO pems_app;   -- this DB restricts PUBLIC connect
GRANT USAGE ON SCHEMA pems TO pems_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA pems TO pems_app;
GRANT USAGE, SELECT               ON ALL SEQUENCES  IN SCHEMA pems TO pems_app;

-- Apply the same grants automatically to any tables/sequences created later in pems.
ALTER DEFAULT PRIVILEGES IN SCHEMA pems GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pems_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pems GRANT USAGE, SELECT ON SEQUENCES TO pems_app;

"""Environment-driven configuration.

Reads from a project-root .env (see .env.example). Keeping every setting here — and
never inlining a host/credential elsewhere — is what makes the future MySQL->Postgres
and on-prem->AWS moves a config change rather than a code change.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from sqlalchemy import URL
from pydantic_settings import BaseSettings, SettingsConfigDict

# project root = two levels up from this file (backend/app/config.py -> PEMS/)
ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # primary database — PostgreSQL: pems_* application tables + synced meter data
    # (corpappdb, schema "pems"). Everything energy/accounting/SAP reads & writes here.
    db_dialect: str = "postgresql+psycopg"
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "pems_app"
    db_pass: str = ""
    db_name: str = "corpappdb"
    db_schema: str = "pems"          # Postgres search_path for the pems_* tables

    # auth database — MySQL: intranet single sign-on, sessions & page-view tracking
    # (balcorpdb). Kept on MySQL by design; only login/activity data lives here.
    auth_db_dialect: str = "mysql+pymysql"
    auth_db_host: str = "localhost"
    auth_db_port: int = 3306
    auth_db_user: str = "root"
    auth_db_pass: str = ""
    auth_db_name: str = "balcorpdb"

    # plant scope
    client_id: str = "CI1001"
    plant_id: str = "PI1001"

    # SAP OData
    sap_odata_base: str = ""
    sap_odata_service: str = "ZPM_POWER_CONSUMPTION_SRV"
    sap_user: str = ""
    sap_pass: str = ""

    # app
    app_env: str = "dev"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"
    app_host: str = "0.0.0.0"     # bind address for the production server
    app_port: int = 8000          # set to an available port on the server (.env)

    @property
    def sqlalchemy_url(self) -> URL:
        # Primary (Postgres). URL.create escapes special characters (e.g. '@' in the
        # password) safely.
        return URL.create(
            self.db_dialect,
            username=self.db_user,
            password=self.db_pass,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    @property
    def auth_sqlalchemy_url(self) -> URL:
        # Auth (MySQL / balcorpdb).
        return URL.create(
            self.auth_db_dialect,
            username=self.auth_db_user,
            password=self.auth_db_pass,
            host=self.auth_db_host,
            port=self.auth_db_port,
            database=self.auth_db_name,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

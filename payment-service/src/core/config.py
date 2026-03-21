"""
Application configuration loaded from environment variables.

Uses Pydantic's BaseSettings for automatic env-var parsing and validation.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration for the Payment Service."""

    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5436/paymentdb"
    )

    BOOKING_SERVICE_URL: str = "http://localhost:3003"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()

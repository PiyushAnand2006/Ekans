"""Ekans Backend Configuration."""

from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    # ── Paths ──
    app_name: str = "Ekans AI Workforce Builder"
    data_dir: str = str(Path.home() / ".ekans")
    db_name: str = "ekans.db"

    # ── Server ──
    host: str = "0.0.0.0"
    port: int = 8001
    cors_origins: list[str] = ["http://localhost:5174", "http://localhost:3000", "http://127.0.0.1:5174"]

    # ── LLM Provider keys (optional, can be set via frontend settings) ──
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    openai_compatible_api_key: str = ""
    openai_compatible_base_url: str = ""

    @property
    def db_path(self) -> str:
        data = Path(self.data_dir)
        data.mkdir(parents=True, exist_ok=True)
        return str(data / self.db_name)

    model_config = {"env_prefix": "EKANS_", "env_file": ".env", "extra": "ignore"}


settings = Settings()

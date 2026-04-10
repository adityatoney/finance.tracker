"""Application settings loaded from environment variables / .env file."""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    encryption_key: str = ""
    db_path: str = "/data/finance.db"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    @property
    def db_path_resolved(self) -> Path:
        return Path(self.db_path)


settings = Settings()

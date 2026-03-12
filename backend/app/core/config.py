from functools import lru_cache
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── App ────────────────────────────────────────────────────────────────
    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    # ── Database ───────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://worldstate:worldstate_secret@localhost:5432/worldstate"

    # ── Redis ──────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── OpenAI ─────────────────────────────────────────────────────────────
    openai_api_key: str
    openai_model: str = "gpt-4.1-mini"          # fallback LLM for intelligence + strategies
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # ── Google (Gemini) ────────────────────────────────────────────────────
    google_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # ── Social Credentials ─────────────────────────────────────────────────
    twitter_bearer_token: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "WorldState/1.0"

    # ── Clustering ─────────────────────────────────────────────────────────
    cluster_trigger_threshold: int = 5          # min sources to trigger intelligence
    cluster_min_samples: int = 2                # HDBSCAN min_samples
    cluster_min_cluster_size: int = 3           # HDBSCAN min_cluster_size
    cluster_cosine_threshold: float = 0.18      # max cosine distance for membership
    cluster_run_interval_seconds: int = 60      # how often cluster worker runs

    # ── Ingestion ──────────────────────────────────────────────────────────
    ingestion_interval_seconds: int = 120       # RSS poll interval
    dedup_similarity_threshold: float = 0.92    # cosine sim above which = duplicate

    # ── Drift / Expiry ─────────────────────────────────────────────────────
    cluster_soft_expire_hours: int = 6          # low-signal clusters
    cluster_hard_expire_hours: int = 24         # all clusters


@lru_cache
def get_settings() -> Settings:
    return Settings()

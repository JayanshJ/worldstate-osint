from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_file_encoding="utf-8")

    # ── App ────────────────────────────────────────────────────────────────
    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    # Comma-separated list of allowed CORS origins for the browser frontend.
    # In development this defaults to localhost; in production it MUST be set
    # explicitly. An empty value in production means "no origins allowed".
    cors_origins: str = ""

    # ── Database ───────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://worldstate:worldstate_secret@localhost:5432/worldstate"

    # ── Auth (JWT) ─────────────────────────────────────────────────────────
    jwt_secret_key: str = ""         # required in production; set in .env
    jwt_expire_minutes: int = 1440   # 24 h
    # Email allowed to claim the first admin seat via /auth/register.
    # If unset, open self-registration is disabled entirely and the first
    # admin must be seeded out-of-band (env var or DB). Prevents a stranger
    # hitting /auth/register on a fresh deploy from becoming super-admin.
    bootstrap_admin_email: str = ""

    # ── Redis ──────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── OpenAI ─────────────────────────────────────────────────────────────
    openai_api_key: str
    openai_model: str = "gpt-5.6-luna"            # fallback LLM for intelligence + strategies
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # ── Google (Gemini) ────────────────────────────────────────────────────
    google_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # ── Finnhub ────────────────────────────────────────────────────────────
    finnhub_api_key: str = ""

    # ── Notifications ──────────────────────────────────────────────────────
    resend_api_key: str = ""          # optional; enables email alert delivery
    app_base_url:   str = "https://worldstate.io"

    # ── Social Credentials ─────────────────────────────────────────────────
    twitter_bearer_token: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "WorldState/1.0"

    # ── Clustering ─────────────────────────────────────────────────────────
    cluster_min_samples: int = 2                # HDBSCAN min_samples
    cluster_min_cluster_size: int = 3           # HDBSCAN min_cluster_size
    cluster_cosine_threshold: float = 0.18      # max cosine distance for membership
    cluster_run_interval_seconds: int = 60      # how often cluster worker runs
    # Minimum weighted credibility score (sum of member source credibility)
    # before a cluster is sent to the AI summarization layer. Single source of
    # truth — the engine reads this instead of a hardcoded constant.
    cluster_intelligence_weighted_threshold: float = 1.8

    # ── Ingestion ──────────────────────────────────────────────────────────
    ingestion_interval_seconds: int = 120       # RSS poll interval
    dedup_similarity_threshold: float = 0.92    # cosine sim above which = duplicate
    # Number of concurrent vectorization consumers pulling from queue:vectorize.
    # Each embedding call is a sequential OpenAI network round-trip; a single
    # consumer caps throughput at ~20-30 articles/min. Bump this to parallelize
    # (each consumer is an independent asyncio task in the ingestion worker).
    vectorization_workers: int = 4

    # ── Drift / Expiry ─────────────────────────────────────────────────────
    cluster_soft_expire_hours: int = 6          # low-signal clusters
    cluster_hard_expire_hours: int = 24         # all clusters
    # Window (hours) of recent articles pulled into each HDBSCAN cycle. Must be
    # >= dedup_similarity_window_hours so articles that escape Layer-2 dedup
    # are still picked up by clustering (otherwise they become orphan
    # embeddings — processed, never clustered, never deduped-against).
    cluster_lookback_hours: int = 24
    # Window for Layer-2 semantic dedup. Kept in sync with clustering lookback
    # to avoid the orphan-embedding gap.
    dedup_similarity_window_hours: int = 24

    @model_validator(mode="after")
    def _validate_required_secrets(self) -> "Settings":
        if self.environment == "test":
            return self
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not set")
        if not self.jwt_secret_key:
            raise ValueError(
                "JWT_SECRET_KEY is not set. "
                "Generate one with: openssl rand -hex 32"
            )
        if self.cluster_lookback_hours < self.dedup_similarity_window_hours:
            raise ValueError(
                f"cluster_lookback_hours ({self.cluster_lookback_hours}) must be >= "
                f"dedup_similarity_window_hours ({self.dedup_similarity_window_hours}) "
                "to avoid orphan embeddings"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

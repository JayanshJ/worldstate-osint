import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class MarketSignal(Base):
    __tablename__ = "market_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Deduplication key — SHA-256 of source URL (or URL+title for scraped items)
    source_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    # Signal classification
    # DEAL | INSIDER_BUY | INSIDER_SELL | ANALYST_UPGRADE | ANALYST_DOWNGRADE | EARNINGS_BEAT | EARNINGS_MISS | RUMOR
    signal_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # Company / instrument info
    ticker:  Mapped[str | None] = mapped_column(String(20))
    company: Mapped[str]        = mapped_column(Text, nullable=False)

    # Content
    headline:   Mapped[str]        = mapped_column(Text, nullable=False)
    ai_summary: Mapped[str | None] = mapped_column(Text)  # Gemini 1-line market impact

    # Direction / size
    bullish:   Mapped[bool | None]  = mapped_column(Boolean)
    magnitude: Mapped[float | None] = mapped_column(Float)  # deal size $B, % target, etc.

    # Provenance
    source_url:  Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(String(80), nullable=False)

    # Timestamps
    published_at: Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True))
    fetched_at:   Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), default=utcnow)
    expires_at:   Mapped[datetime]      = mapped_column(TIMESTAMP(timezone=True), index=True)
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MarketStrategy(Base):
    __tablename__ = "market_strategies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    generated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # AI-generated content
    title: Mapped[str] = mapped_column(Text, nullable=False)
    thesis: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[list] = mapped_column(JSONB, nullable=False)       # ["point1", "point2", "point3"]

    # Classification
    asset_class: Mapped[str] = mapped_column(String(50), nullable=False) # COMMODITY | EQUITY | FOREX | CRYPTO | BONDS | VOLATILITY
    specific_assets: Mapped[list] = mapped_column(JSONB, nullable=False)  # ["Brent Crude (UKOIL)", ...]
    direction: Mapped[str] = mapped_column(String(20), nullable=False)    # LONG | SHORT | HEDGE | NEUTRAL
    timeframe: Mapped[str] = mapped_column(String(20), nullable=False)    # INTRADAY | SHORT | MEDIUM | LONG
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)   # LOW | MODERATE | HIGH | SPECULATIVE

    # Scores derived from source clusters
    confidence: Mapped[float] = mapped_column(Float, default=0.5)         # [0, 1]
    volatility_context: Mapped[float] = mapped_column(Float, default=0.0) # avg volatility of source clusters
    sentiment_context: Mapped[float] = mapped_column(Float, default=0.0)  # avg sentiment of source clusters

    # Source cluster references
    source_cluster_ids: Mapped[list] = mapped_column(JSONB, default=list)
    related_regions: Mapped[list] = mapped_column(JSONB, default=list)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

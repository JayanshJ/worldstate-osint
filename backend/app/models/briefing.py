import uuid
from datetime import datetime, date

from sqlalchemy import Date, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class MorningBriefing(Base):
    """
    Daily AI-generated morning briefing.
    One record per UTC date — upserted by briefing_engine.
    """
    __tablename__ = "morning_briefings"

    id:           Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date:         Mapped[date]      = mapped_column(Date, nullable=False, unique=True, index=True)
    headline:     Mapped[str]       = mapped_column(Text, nullable=False)
    tldr:         Mapped[str]       = mapped_column(Text, nullable=False)
    top_events:   Mapped[list]      = mapped_column(JSONB, default=list)
    trade_setups: Mapped[list]      = mapped_column(JSONB, default=list)
    macro_theme:  Mapped[str]       = mapped_column(Text, nullable=False, default="")
    generated_at: Mapped[datetime]  = mapped_column(TIMESTAMP(timezone=True), default=utcnow)

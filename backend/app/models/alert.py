import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AlertWatch(Base):
    """
    User-defined watch rule. Fires when a matching cluster crosses the threshold.
    """
    __tablename__ = "alert_watches"

    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name:            Mapped[str] = mapped_column(String(200), nullable=False)

    # Match criteria (at least one must be set)
    keywords:        Mapped[list | None] = mapped_column(JSONB)       # ["ukraine", "nato"]
    entities:        Mapped[list | None] = mapped_column(JSONB)       # ["Zelensky", "NATO"]
    source_ids:      Mapped[list | None] = mapped_column(JSONB)       # ["reuters_world"]

    # Threshold
    min_volatility:  Mapped[float] = mapped_column(Float, default=0.0)
    min_sources:     Mapped[int] = mapped_column(Integer, default=1)

    # State
    is_active:       Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:      Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    last_fired_at:   Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fire_count:      Mapped[int] = mapped_column(Integer, default=0)

    # Notification channel: "websocket" | "browser"
    channel:         Mapped[str] = mapped_column(String(50), default="websocket")

    firings: Mapped[list["AlertFiring"]] = relationship(back_populates="watch", lazy="dynamic")


class AlertFiring(Base):
    """
    Record of each time an alert watch fired.
    """
    __tablename__ = "alert_firings"

    id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watch_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("alert_watches.id", ondelete="CASCADE"))
    cluster_id:  Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("event_clusters.id", ondelete="CASCADE"))
    fired_at:    Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    payload:     Mapped[dict | None] = mapped_column(JSONB)

    watch: Mapped["AlertWatch"] = relationship(back_populates="firings")

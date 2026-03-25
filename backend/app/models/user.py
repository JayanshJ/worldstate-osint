import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id:              Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email:           Mapped[str]            = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str]            = mapped_column(String(255), nullable=False)
    is_admin:        Mapped[bool]           = mapped_column(Boolean, default=False)
    is_approved:     Mapped[bool]           = mapped_column(Boolean, default=False)
    org_id:          Mapped[uuid.UUID|None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at:      Mapped[datetime]       = mapped_column(TIMESTAMP(timezone=True), default=datetime.utcnow)

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, ForeignKey,
    Numeric, SmallInteger, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class SCCompany(Base):
    __tablename__ = "sc_companies"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker           = Column(String(20), unique=True, index=True, nullable=False)
    cik              = Column(String(20))
    legal_name       = Column(Text, nullable=False)
    hq_country       = Column(String(3))          # ISO 3166-1 alpha-3
    sector           = Column(String(200))         # SEC SIC description
    sic_code         = Column(String(10))
    last_filing_date = Column(Date)
    created_at       = Column(Date, default=lambda: datetime.now(timezone.utc).date())
    updated_at       = Column(Date, default=lambda: datetime.now(timezone.utc).date(),
                              onupdate=lambda: datetime.now(timezone.utc).date())

    edges = relationship(
        "SCEdge", back_populates="focal_company",
        foreign_keys="SCEdge.focal_id", cascade="all, delete-orphan",
    )


class SCEdge(Base):
    __tablename__ = "sc_edges"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    focal_id          = Column(UUID(as_uuid=True),
                               ForeignKey("sc_companies.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    entity_name       = Column(Text, nullable=False)
    entity_ticker     = Column(String(20))

    # UPSTREAM (supplier) | DOWNSTREAM (customer) | COMPETITOR
    direction         = Column(String(20), nullable=False)
    # SUPPLIER | CUSTOMER | JV_PARTNER | LICENSEE | DISTRIBUTOR | CONTRACT_MANUFACTURER
    relationship_type = Column(String(50))

    tier              = Column(SmallInteger, default=1)      # 1, 2, 3
    pct_revenue       = Column(Numeric(6, 2))                # % of focal revenue (DOWNSTREAM)
    pct_cogs          = Column(Numeric(6, 2))                # % of focal COGS (UPSTREAM)
    sole_source       = Column(Boolean, default=False)

    # DISCLOSED (from filing) | ESTIMATED (LLM inferred) | INFERRED (from news)
    disclosure_type   = Column(String(20), default="DISCLOSED")
    confidence        = Column(Numeric(3, 2), default=1.0)   # 0.0 – 1.0
    evidence          = Column(Text)                          # verbatim quote
    hq_country        = Column(String(3))
    as_of_date        = Column(Date, nullable=False)
    created_at        = Column(Date, default=lambda: datetime.now(timezone.utc).date())

    focal_company = relationship("SCCompany", back_populates="edges", foreign_keys=[focal_id])

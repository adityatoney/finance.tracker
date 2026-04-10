"""SQLAlchemy ORM models — single source of truth for the database schema.

The Next.js Drizzle schema in web/src/lib/db/schema.ts must mirror these models.
If you modify this file, update the Drizzle schema accordingly.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Float,
    Text,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Statement(Base):
    __tablename__ = "statements"

    id = Column(String, primary_key=True, default=generate_uuid)
    brokerage = Column(String, nullable=False)  # fidelity / robinhood / betterment
    statement_date = Column(String, nullable=False)  # YYYY-MM
    file_name = Column(String, nullable=False)
    file_hash = Column(String, nullable=False, unique=True)  # SHA-256 dedup
    account_number_enc = Column(Text, nullable=False, default="")  # Fernet-encrypted
    owner_name_enc = Column(Text, nullable=False, default="")  # Fernet-encrypted
    total_value = Column(Float, nullable=False, default=0.0)
    net_deposits = Column(Float, nullable=False, default=0.0)
    uploaded_at = Column(String, nullable=False, default=utc_now_iso)

    holdings = relationship("Holding", back_populates="statement", cascade="all, delete-orphan")
    deposits = relationship("Deposit", back_populates="statement", cascade="all, delete-orphan")


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(String, primary_key=True, default=generate_uuid)
    statement_id = Column(String, ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String, default="")
    quantity = Column(Float, default=0.0)
    price = Column(Float, default=0.0)
    market_value = Column(Float, nullable=False, default=0.0)
    category = Column(String, nullable=False, default="")

    statement = relationship("Statement", back_populates="holdings")

    __table_args__ = (
        Index("idx_holdings_stmt", "statement_id"),
        Index("idx_holdings_ticker", "ticker"),
    )


class Deposit(Base):
    __tablename__ = "deposits"

    id = Column(String, primary_key=True, default=generate_uuid)
    statement_id = Column(String, ForeignKey("statements.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    description = Column(String, default="")
    date = Column(String, default="")

    statement = relationship("Statement", back_populates="deposits")


class TickerMap(Base):
    __tablename__ = "ticker_map"

    ticker = Column(String, primary_key=True)
    category = Column(String, nullable=False)  # foundational/value/growth/emergency_fund/btc_crypto
    source = Column(String, nullable=False, default="user")  # seed / user
    updated_at = Column(String, nullable=False, default=utc_now_iso)


class MonthlySnapshot(Base):
    __tablename__ = "monthly_snapshots"

    id = Column(String, primary_key=True, default=generate_uuid)
    month = Column(String, nullable=False)  # YYYY-MM
    category = Column(String, nullable=False)
    total_value = Column(Float, nullable=False, default=0.0)
    net_deposits = Column(Float, nullable=False, default=0.0)
    market_gain = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint("month", "category", name="uq_snapshot_month_category"),
        Index("idx_snapshots_month", "month"),
    )


class PIIAuditLog(Base):
    __tablename__ = "pii_audit_log"

    id = Column(String, primary_key=True, default=generate_uuid)
    statement_id = Column(String, ForeignKey("statements.id"), nullable=True)
    field_name = Column(String, nullable=False)
    pii_type = Column(String, nullable=False)
    action = Column(String, nullable=False, default="encrypted")
    created_at = Column(String, nullable=False, default=utc_now_iso)

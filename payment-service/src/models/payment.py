"""
Payment SQLAlchemy model – mirrors the legacy ``payments`` table schema.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


def _utcnow() -> datetime:
    """Return the current UTC timestamp (timezone-aware)."""
    return datetime.now(timezone.utc)


class Payment(Base):
    """ORM representation of the ``payments`` table."""

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True,
    )
    booking_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    amount: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50), default="pending",
    )
    payment_method: Mapped[str] = mapped_column(
        String(100), default="pending_selection",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow,
    )

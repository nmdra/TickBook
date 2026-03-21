"""
Async SQLAlchemy database engine, session factory, and dependency.

Provides:
- ``engine``   – AsyncEngine bound to the configured DATABASE_URL.
- ``AsyncSessionLocal`` – Session factory producing ``AsyncSession`` instances.
- ``Base``     – Declarative base for all ORM models.
- ``get_db()`` – FastAPI dependency that yields a per-request session.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.core.config import settings

# ── Engine ───────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

# ── Session factory ──────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Declarative base ────────────────────────────────────────────────
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


# ── FastAPI dependency ───────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional async session, then close it."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

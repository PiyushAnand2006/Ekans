"""SQLite database setup and async session management."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""
    pass


# ── ORM Models ───────────────────────────────────────────────────

class OrganizationRow(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="My AI Organization")
    description = Column(Text, default="")
    objective = Column(Text, default="")
    agents_json = Column(Text, default="[]")          # JSON serialized
    relationships_json = Column(Text, default="[]")    # JSON serialized
    positions_json = Column(Text, default="{}")        # JSON serialized
    tools_json = Column(Text, default="[]")
    budget_json = Column(Text, default='{"max_cost": 1.0, "currency": "USD"}')
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RunRow(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    objective = Column(Text, default="")
    status = Column(String, default="PENDING")
    total_cost = Column(Float, default=0.0)
    result_json = Column(Text, default="null")
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class TaskRow(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    organization_id = Column(String, nullable=False)
    run_id = Column(String, nullable=False)
    parent_task_id = Column(String, nullable=True)
    title = Column(String, default="")
    description = Column(Text, default="")
    assigned_agent_id = Column(String, default="")
    requested_by_agent_id = Column(String, default="")
    status = Column(String, default="PENDING")
    priority = Column(Integer, default=0)
    dependencies_json = Column(Text, default="[]")
    expected_output = Column(Text, default="")
    result_json = Column(Text, default="null")
    error = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    cost_json = Column(Text, default='{"input_tokens": 0, "output_tokens": 0, "estimated_cost": 0.0}')
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class EventRow(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True)
    run_id = Column(String, nullable=False)
    category = Column(String, nullable=False)
    agent_id = Column(String, nullable=True)
    task_id = Column(String, nullable=True)
    message = Column(Text, default="")
    payload_json = Column(Text, default="{}")
    timestamp = Column(DateTime, default=datetime.utcnow)


class ApprovalRow(Base):
    __tablename__ = "approvals"

    id = Column(String, primary_key=True)
    run_id = Column(String, nullable=False)
    task_id = Column(String, nullable=False)
    agent_id = Column(String, nullable=False)
    action = Column(String, default="")
    description = Column(Text, default="")
    payload_json = Column(Text, default="{}")
    status = Column(String, default="PENDING")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


# ── Engine & Session ─────────────────────────────────────────────

_engine = None
_session_factory = None


async def get_engine():
    global _engine
    if _engine is None:
        db_path = settings.db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(
            f"sqlite+aiosqlite:///{db_path}",
            echo=False,
            json_serializer=json.dumps,
            json_deserializer=json.loads,
        )
    return _engine


async def get_session_factory():
    global _session_factory
    if _session_factory is None:
        engine = await get_engine()
        _session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return _session_factory


async def get_session() -> AsyncSession:
    factory = await get_session_factory()
    async with factory() as session:
        yield session


async def init_db():
    """Create all tables if they don't exist."""
    engine = await get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Close the database engine."""
    global _engine, _session_factory
    if _engine:
        await _engine.dispose()
        _engine = None
        _session_factory = None

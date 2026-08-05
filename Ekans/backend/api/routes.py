"""FastAPI REST API routes for Organizations, Runs, and Health."""

from __future__ import annotations

import json
from datetime import datetime
import asyncio
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.domain import (
    AgentDefinition,
    CreateRunRequest,
    CreateOrganizationRequest,
    HealthResponse,
    OrganizationDefinition,
    OrganizationRelationship,
    RunDefinition, RuntimeEvent, TaskDefinition, TaskStatus, RunStatus,
    UpdateOrganizationRequest,
)
from backend.runtime.orchestrator import WorkforceOrchestrator
from backend.storage.database import EventRow, OrganizationRow, RunRow, TaskRow, get_session, get_session_factory

router = APIRouter()


def organization_from_row(row: OrganizationRow) -> OrganizationDefinition:
    return OrganizationDefinition(
        id=row.id, name=row.name, description=row.description, objective=row.objective,
        agents=[AgentDefinition(**a) for a in json.loads(row.agents_json or "[]")],
        relationships=[OrganizationRelationship(**r) for r in json.loads(row.relationships_json or "[]")],
        positions=json.loads(row.positions_json or "{}"), tools=json.loads(row.tools_json or "[]"),
        budget=json.loads(row.budget_json or '{"max_cost": 1.0, "currency": "USD"}'),
        metadata=json.loads(row.metadata_json or "{}"), created_at=row.created_at, updated_at=row.updated_at,
    )


def public_agent_payload(agent: AgentDefinition) -> dict:
    return agent.model_dump(exclude={"api_key"})


def public_organization_payload(organization: OrganizationDefinition) -> dict:
    return organization.model_dump(exclude={"agents": {"__all__": {"api_key"}}})


def task_from_row(row: TaskRow) -> TaskDefinition:
    return TaskDefinition(id=row.id, organization_id=row.organization_id, run_id=row.run_id, parent_task_id=row.parent_task_id,
        title=row.title, description=row.description, assigned_agent_id=row.assigned_agent_id, requested_by_agent_id=row.requested_by_agent_id,
        status=TaskStatus(row.status), priority=row.priority, dependencies=json.loads(row.dependencies_json or "[]"),
        expected_output=row.expected_output, result=json.loads(row.result_json or "null"), error=row.error, retry_count=row.retry_count,
        cost=json.loads(row.cost_json or "{}"), created_at=row.created_at, started_at=row.started_at, completed_at=row.completed_at)


async def run_from_row(row: RunRow, session: AsyncSession) -> RunDefinition:
    tasks = (await session.execute(select(TaskRow).where(TaskRow.run_id == row.id).order_by(TaskRow.created_at))).scalars().all()
    return RunDefinition(id=row.id, organization_id=row.organization_id, objective=row.objective, status=RunStatus(row.status),
        tasks=[task_from_row(task) for task in tasks], total_cost=row.total_cost, created_at=row.created_at, started_at=row.started_at,
        completed_at=row.completed_at, result=json.loads(row.result_json or "null"))


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", app="Ekans AI Workforce Builder", version="0.1.0")


@router.get("/organizations", response_model=List[OrganizationDefinition])
async def list_organizations(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(OrganizationRow))
    rows = result.scalars().all()
    orgs = []
    for row in rows:
        orgs.append(
            OrganizationDefinition(
                id=row.id,
                name=row.name,
                description=row.description,
                objective=row.objective,
                agents=[AgentDefinition(**a) for a in json.loads(row.agents_json or "[]")],
                relationships=[OrganizationRelationship(**r) for r in json.loads(row.relationships_json or "[]")],
                positions=json.loads(row.positions_json or "{}"),
                tools=json.loads(row.tools_json or "[]"),
                budget=json.loads(row.budget_json or '{"max_cost": 1.0, "currency": "USD"}'),
                metadata=json.loads(row.metadata_json or "{}"),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
    return orgs


@router.post("/organizations", response_model=OrganizationDefinition, status_code=status.HTTP_201_CREATED)
async def create_organization(req: CreateOrganizationRequest, session: AsyncSession = Depends(get_session)):
    org_id = str(uuid4())
    now = datetime.utcnow()
    row = OrganizationRow(
        id=org_id,
        name=req.name,
        description=req.description,
        agents_json=json.dumps([public_agent_payload(a) for a in req.agents]),
        relationships_json=json.dumps([r.model_dump() for r in req.relationships]),
        positions_json=json.dumps(req.positions),
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    return OrganizationDefinition(
        id=row.id,
        name=row.name,
        description=row.description,
        agents=req.agents,
        relationships=req.relationships,
        positions=req.positions,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/organizations/{org_id}", response_model=OrganizationDefinition)
async def get_organization(org_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(OrganizationRow).where(OrganizationRow.id == org_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Organization not found")

    return OrganizationDefinition(
        id=row.id,
        name=row.name,
        description=row.description,
        objective=row.objective,
        agents=[AgentDefinition(**a) for a in json.loads(row.agents_json or "[]")],
        relationships=[OrganizationRelationship(**r) for r in json.loads(row.relationships_json or "[]")],
        positions=json.loads(row.positions_json or "{}"),
        tools=json.loads(row.tools_json or "[]"),
        budget=json.loads(row.budget_json or '{"max_cost": 1.0, "currency": "USD"}'),
        metadata=json.loads(row.metadata_json or "{}"),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put("/organizations/{org_id}", response_model=OrganizationDefinition)
async def update_organization(org_id: str, req: UpdateOrganizationRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(OrganizationRow).where(OrganizationRow.id == org_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Organization not found")

    if req.name is not None:
        row.name = req.name
    if req.description is not None:
        row.description = req.description
    if req.objective is not None:
        row.objective = req.objective
    if req.agents is not None:
        row.agents_json = json.dumps([a.model_dump(by_alias=True) for a in req.agents])
    if req.relationships is not None:
        row.relationships_json = json.dumps([r.model_dump() for r in req.relationships])
    if req.positions is not None:
        row.positions_json = json.dumps(req.positions)

    row.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)

    return OrganizationDefinition(
        id=row.id,
        name=row.name,
        description=row.description,
        objective=row.objective,
        agents=[AgentDefinition(**a) for a in json.loads(row.agents_json or "[]")],
        relationships=[OrganizationRelationship(**r) for r in json.loads(row.relationships_json or "[]")],
        positions=json.loads(row.positions_json or "{}"),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(org_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(OrganizationRow).where(OrganizationRow.id == org_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Organization not found")
    await session.delete(row)
    await session.commit()


@router.post("/organizations/{org_id}/runs", response_model=RunDefinition, status_code=status.HTTP_202_ACCEPTED)
async def start_organization_run(org_id: str, req: CreateRunRequest, session: AsyncSession = Depends(get_session)):
    row = (await session.execute(select(OrganizationRow).where(OrganizationRow.id == org_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Organization not found")
    organization = organization_from_row(row)
    run = RunRow(id=str(uuid4()), organization_id=organization.id, objective=req.objective, status=RunStatus.PENDING.value, created_at=datetime.utcnow())
    session.add(run)
    await session.commit()
    factory = await get_session_factory()
    asyncio.create_task(WorkforceOrchestrator(factory, run.id, organization, req.objective, req.provider_keys).run())
    return await run_from_row(run, session)


@router.post("/runs", response_model=RunDefinition, status_code=status.HTTP_202_ACCEPTED)
async def start_unsaved_organization_run(req: CreateRunRequest, session: AsyncSession = Depends(get_session)):
    if req.organization is None:
        raise HTTPException(status_code=422, detail="An organization snapshot is required")
    organization = req.organization
    existing = (await session.execute(select(OrganizationRow).where(OrganizationRow.id == organization.id))).scalar_one_or_none()
    if not existing:
        session.add(OrganizationRow(id=organization.id, name=organization.name, description=organization.description,
            objective=organization.objective, agents_json=json.dumps([public_agent_payload(a) for a in organization.agents]),
            relationships_json=json.dumps([r.model_dump() for r in organization.relationships]), positions_json=json.dumps(organization.positions),
            tools_json=json.dumps(organization.tools), budget_json=json.dumps(organization.budget.model_dump()), metadata_json=json.dumps(organization.metadata),
            created_at=organization.created_at, updated_at=organization.updated_at))
        await session.commit()
    run = RunRow(id=str(uuid4()), organization_id=organization.id, objective=req.objective, status=RunStatus.PENDING.value, created_at=datetime.utcnow())
    session.add(run)
    await session.commit()
    factory = await get_session_factory()
    asyncio.create_task(WorkforceOrchestrator(factory, run.id, organization, req.objective, req.provider_keys).run())
    return await run_from_row(run, session)


@router.get("/runs/{run_id}", response_model=RunDefinition)
async def get_run(run_id: str, session: AsyncSession = Depends(get_session)):
    row = await session.get(RunRow, run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return await run_from_row(row, session)


@router.post("/runs/{run_id}/cancel", response_model=RunDefinition)
async def cancel_run(run_id: str, session: AsyncSession = Depends(get_session)):
    row = await session.get(RunRow, run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    if row.status in {RunStatus.PENDING.value, RunStatus.RUNNING.value}:
        row.status, row.completed_at = RunStatus.CANCELLED.value, datetime.utcnow()
        await session.commit()
    return await run_from_row(row, session)


@router.get("/runs/{run_id}/events", response_model=list[RuntimeEvent])
async def get_run_events(run_id: str, session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(EventRow).where(EventRow.run_id == run_id).order_by(EventRow.timestamp))).scalars().all()
    return [RuntimeEvent(id=row.id, run_id=row.run_id, category=row.category, agent_id=row.agent_id, task_id=row.task_id,
        message=row.message, payload=json.loads(row.payload_json or "{}"), timestamp=row.timestamp) for row in rows]

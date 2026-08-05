"""FastAPI REST API routes for Organizations, Runs, and Health."""

from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.domain import (
    AgentDefinition,
    CreateOrganizationRequest,
    HealthResponse,
    OrganizationDefinition,
    OrganizationRelationship,
    RunDefinition,
    UpdateOrganizationRequest,
)
from backend.storage.database import OrganizationRow, RunRow, get_session

router = APIRouter()


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
        agents_json=json.dumps([a.model_dump(by_alias=True) for a in req.agents]),
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

"""Ekans Domain Models — Pydantic schemas for Agent, Organization, Task, Run, Event."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────

class AgentType(str, Enum):
    MANAGER = "MANAGER"
    SPECIALIST = "SPECIALIST"
    REVIEWER = "REVIEWER"
    HUMAN = "HUMAN"
    CUSTOM = "CUSTOM"


class RelationshipType(str, Enum):
    MANAGES = "MANAGES"
    REPORTS_TO = "REPORTS_TO"
    COLLABORATES_WITH = "COLLABORATES_WITH"
    REVIEWS = "REVIEWS"
    DELEGATES_TO = "DELEGATES_TO"


class PermissionLevel(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"
    ASSIGNED = "ASSIGNED"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    REVIEW = "REVIEW"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RunStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AgentStatus(str, Enum):
    IDLE = "IDLE"
    PLANNING = "PLANNING"
    WORKING = "WORKING"
    WAITING = "WAITING"
    REVIEWING = "REVIEWING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class EventCategory(str, Enum):
    RUN_STARTED = "RUN_STARTED"
    OBJECTIVE_RECEIVED = "OBJECTIVE_RECEIVED"
    TASK_CREATED = "TASK_CREATED"
    TASK_ASSIGNED = "TASK_ASSIGNED"
    TASK_STARTED = "TASK_STARTED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_FAILED = "TASK_FAILED"
    AGENT_STARTED = "AGENT_STARTED"
    AGENT_THINKING = "AGENT_THINKING"
    AGENT_WAITING = "AGENT_WAITING"
    AGENT_COMPLETED = "AGENT_COMPLETED"
    TOOL_REQUESTED = "TOOL_REQUESTED"
    TOOL_STARTED = "TOOL_STARTED"
    TOOL_COMPLETED = "TOOL_COMPLETED"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_GRANTED = "APPROVAL_GRANTED"
    APPROVAL_REJECTED = "APPROVAL_REJECTED"
    VERIFICATION_STARTED = "VERIFICATION_STARTED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    REPAIR_REQUESTED = "REPAIR_REQUESTED"
    VERIFICATION_PASSED = "VERIFICATION_PASSED"
    RUN_COMPLETED = "RUN_COMPLETED"
    RUN_FAILED = "RUN_FAILED"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ── Value Objects ─────────────────────────────────────────────────

class ModelConfig(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 4096


class ToolPermission(BaseModel):
    tool_id: str
    permission: PermissionLevel = PermissionLevel.ALLOW


class BudgetConfig(BaseModel):
    max_cost: float = 1.0
    currency: str = "USD"


class CostRecord(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost: float = 0.0


# ── Core Domain Models ───────────────────────────────────────────

class AgentDefinition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    role: str
    description: str = ""
    goal: str = ""
    responsibilities: list[str] = Field(default_factory=list)
    instructions: str = ""
    agent_type: AgentType = AgentType.SPECIALIST
    reports_to: str | None = None
    manages: list[str] = Field(default_factory=list)
    model_config_: ModelConfig = Field(default_factory=ModelConfig, alias="model_config")
    tools: list[str] = Field(default_factory=list)
    permissions: list[ToolPermission] = Field(default_factory=list)
    knowledge_sources: list[str] = Field(default_factory=list)
    budget: BudgetConfig = Field(default_factory=BudgetConfig)
    color: str = "#4a9eff"
    api_key: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class OrganizationRelationship(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    source_id: str
    target_id: str
    type: RelationshipType = RelationshipType.MANAGES


class OrganizationDefinition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = "My AI Organization"
    description: str = ""
    objective: str = ""
    agents: list[AgentDefinition] = Field(default_factory=list)
    relationships: list[OrganizationRelationship] = Field(default_factory=list)
    positions: dict[str, dict[str, float]] = Field(default_factory=dict)
    tools: list[str] = Field(default_factory=list)
    budget: BudgetConfig = Field(default_factory=BudgetConfig)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: datetime = Field(default_factory=lambda: datetime.utcnow())


class TaskDefinition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    organization_id: str
    run_id: str
    parent_task_id: str | None = None
    title: str
    description: str = ""
    assigned_agent_id: str = ""
    requested_by_agent_id: str = ""
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 0
    dependencies: list[str] = Field(default_factory=list)
    expected_output: str = ""
    result: Any = None
    error: str | None = None
    retry_count: int = 0
    cost: CostRecord = Field(default_factory=CostRecord)
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    started_at: datetime | None = None
    completed_at: datetime | None = None


class RunDefinition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    organization_id: str
    objective: str
    status: RunStatus = RunStatus.PENDING
    tasks: list[TaskDefinition] = Field(default_factory=list)
    total_cost: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: Any = None


class RuntimeEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    run_id: str
    category: EventCategory
    agent_id: str | None = None
    task_id: str | None = None
    message: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())


class ApprovalRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    run_id: str
    task_id: str
    agent_id: str
    action: str
    description: str
    payload: dict[str, Any] = Field(default_factory=dict)
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    resolved_at: datetime | None = None


# ── API Request/Response Models ───────────────────────────────────

class CreateOrganizationRequest(BaseModel):
    name: str = "My AI Organization"
    description: str = ""
    agents: list[AgentDefinition] = Field(default_factory=list)
    relationships: list[OrganizationRelationship] = Field(default_factory=list)
    positions: dict[str, dict[str, float]] = Field(default_factory=dict)


class UpdateOrganizationRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    objective: str | None = None
    agents: list[AgentDefinition] | None = None
    relationships: list[OrganizationRelationship] | None = None
    positions: dict[str, dict[str, float]] | None = None


class CreateRunRequest(BaseModel):
    objective: str = Field(min_length=3, max_length=20_000)
    provider_keys: dict[str, str] = Field(default_factory=dict)
    # The visual editor can run an unsaved organization. This snapshot is only
    # persisted as an organization record, never alongside the secret keys.
    organization: OrganizationDefinition | None = None


class ProviderKeysRequest(BaseModel):
    """API keys sent from frontend for a run (never stored on disk)."""
    openai: str = ""
    anthropic: str = ""
    google: str = ""
    ollama_url: str = "http://localhost:11434"
    openai_compatible_key: str = ""
    openai_compatible_url: str = ""


class HealthResponse(BaseModel):
    status: str = "ok"
    app: str = "Ekans AI Workforce Builder"
    version: str = "0.1.0"

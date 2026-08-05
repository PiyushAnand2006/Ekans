"""Safe local workforce runtime with manager-led delegation."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.events.event_bus import event_bus
from backend.models.domain import AgentDefinition, EventCategory, OrganizationDefinition, RunStatus, RuntimeEvent, TaskStatus
from backend.providers.base import ProviderError
from backend.providers.registry import provider_for
from backend.storage.database import EventRow, RunRow, TaskRow


DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-20250514",
    "google": "gemini-2.5-flash",
    "gemini": "gemini-2.5-flash",
    "openrouter": "openai/gpt-4o-mini",
    "ollama": "llama3.3",
    "openai-compatible": "gpt-4o-mini",
}


class WorkforceOrchestrator:
    def __init__(self, session_factory: async_sessionmaker, run_id: str, organization: OrganizationDefinition, objective: str, provider_keys: dict[str, Any]) -> None:
        self.session_factory, self.run_id = session_factory, run_id
        self.organization, self.objective, self.provider_keys = organization, objective, provider_keys

    async def emit(self, category: EventCategory, message: str, agent_id: str | None = None, task_id: str | None = None) -> None:
        event = RuntimeEvent(run_id=self.run_id, category=category, message=message, agent_id=agent_id, task_id=task_id)
        async with self.session_factory() as session:
            session.add(EventRow(id=event.id, run_id=event.run_id, category=event.category.value, agent_id=agent_id, task_id=task_id, message=message, payload_json="{}", timestamp=event.timestamp))
            await session.commit()
        await event_bus.publish(event)

    @staticmethod
    def _system(agent: AgentDefinition) -> str:
        return f"You are {agent.name}, the organization's {agent.role}. Goal: {agent.goal or 'help achieve the objective'}. Responsibilities: {', '.join(agent.responsibilities) or 'complete assigned work'}. Follow these instructions: {agent.instructions or 'Be accurate, practical, and concise.'}"

    def _effective_model(self, agent: AgentDefinition) -> str:
        model = agent.model_config_.model.strip()
        if model:
            return model
        provider = agent.model_config_.provider.lower().replace("_", "-")
        return DEFAULT_MODELS.get(provider, DEFAULT_MODELS.get("openai", "gpt-4o-mini"))

    async def _complete(self, agent: AgentDefinition, prompt: str) -> tuple[str, int, int]:
        try:
            response = await provider_for(agent.model_config_.provider, self.provider_keys, agent.api_key).complete(model=self._effective_model(agent), system=self._system(agent), prompt=prompt, temperature=agent.model_config_.temperature, max_tokens=agent.model_config_.max_tokens)
            return response.text, response.input_tokens, response.output_tokens
        except ProviderError as exc:
            # Never invent a model result when configuration is invalid.
            return f"No provider response: {exc}", 0, 0

    async def _worker(self, agent: AgentDefinition, manager_id: str) -> tuple[str, str, int, int]:
        task_id = str(uuid4())
        async with self.session_factory() as session:
            session.add(TaskRow(id=task_id, organization_id=self.organization.id, run_id=self.run_id, title=f"{agent.role}: contribute to objective", description=self.objective, assigned_agent_id=agent.id, requested_by_agent_id=manager_id, status=TaskStatus.PENDING.value, created_at=datetime.utcnow()))
            await session.commit()
        await self.emit(EventCategory.TASK_CREATED, f"Manager delegated work to {agent.name}", agent.id, task_id)
        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            row.status, row.started_at = TaskStatus.RUNNING.value, datetime.utcnow()
            await session.commit()
        await self.emit(EventCategory.TASK_STARTED, f"{agent.name} is working", agent.id, task_id)
        text, in_tokens, out_tokens = await self._complete(agent, f"Organization objective:\n{self.objective}\n\nProduce your specialist contribution. State findings, assumptions, and recommended next actions.")
        failed = text.startswith("No provider response:")
        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            row.status, row.completed_at = (TaskStatus.FAILED if failed else TaskStatus.COMPLETED).value, datetime.utcnow()
            row.result_json, row.error = json.dumps({"text": text}), text if failed else None
            row.cost_json = json.dumps({"input_tokens": in_tokens, "output_tokens": out_tokens, "estimated_cost": 0.0})
            await session.commit()
        await self.emit(EventCategory.TASK_FAILED if failed else EventCategory.TASK_COMPLETED, f"{agent.name} {'could not complete' if failed else 'completed'} their task", agent.id, task_id)
        return agent.name, text, in_tokens, out_tokens

    async def run(self) -> None:
        managers = [a for a in self.organization.agents if a.agent_type.value == "MANAGER"]
        manager = managers[0] if managers else next((a for a in self.organization.agents if a.agent_type.value != "HUMAN"), None)
        if manager is None:
            await self.finish(RunStatus.FAILED, {"error": "Add at least one AI agent before running the organization."})
            return
        await self.set_status(RunStatus.RUNNING)
        await self.emit(EventCategory.RUN_STARTED, "Workforce run started")
        await self.emit(EventCategory.OBJECTIVE_RECEIVED, self.objective, manager.id)
        workers = [a for a in self.organization.agents if a.id != manager.id and a.agent_type.value not in {"MANAGER", "HUMAN"}] or [manager]
        results = await asyncio.gather(*(self._worker(agent, manager.id) for agent in workers))
        usable = [(name, text) for name, text, _, _ in results if not text.startswith("No provider response:")]
        await self.emit(EventCategory.AGENT_THINKING, f"{manager.name} is synthesizing team output", manager.id)
        if usable:
            material = "\n\n".join(f"## {name}\n{text}" for name, text in usable)
            final, _, _ = await self._complete(manager, f"Objective:\n{self.objective}\n\nTeam contributions:\n{material}\n\nReturn a clear final response, including open questions and next steps.")
        else:
            final = "The organization could not obtain a model response. Configure a valid provider key and model in Settings, then run again."
        await self.finish(RunStatus.COMPLETED, {"text": final, "contributors": [name for name, _ in usable]})

    async def set_status(self, status: RunStatus) -> None:
        async with self.session_factory() as session:
            row = await session.get(RunRow, self.run_id)
            row.status = status.value
            if status == RunStatus.RUNNING: row.started_at = datetime.utcnow()
            await session.commit()

    async def finish(self, status: RunStatus, result: dict[str, Any]) -> None:
        async with self.session_factory() as session:
            row = await session.get(RunRow, self.run_id)
            if row.status == RunStatus.CANCELLED.value:
                return
            row.status, row.result_json, row.completed_at = status.value, json.dumps(result), datetime.utcnow()
            await session.commit()
        await self.emit(EventCategory.RUN_COMPLETED if status == RunStatus.COMPLETED else EventCategory.RUN_FAILED, "Workforce run completed" if status == RunStatus.COMPLETED else result["error"])

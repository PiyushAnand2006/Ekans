"""Safe local workforce runtime with Context-Aware Multi-Agent Orchestration Brain."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.events.event_bus import event_bus
from backend.models.domain import AgentDefinition, EventCategory, OrganizationDefinition, RunStatus, RuntimeEvent, TaskDefinition, TaskStatus
from backend.providers.base import ProviderError
from backend.providers.registry import provider_for
from backend.runtime.context_router import ContextRouter, parse_structured_handoff
from backend.runtime.dag import TaskDAG
from backend.runtime.decomposer import DecomposedTask, TaskDecomposer
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
    def __init__(
        self,
        session_factory: async_sessionmaker,
        run_id: str,
        organization: OrganizationDefinition,
        objective: str,
        provider_keys: dict[str, Any]
    ) -> None:
        self.session_factory = session_factory
        self.run_id = run_id
        self.organization = organization
        self.objective = objective
        self.provider_keys = provider_keys

        # Runtime mappings
        self.agents_by_id: dict[str, AgentDefinition] = {a.id: a for a in organization.agents}
        self.task_defs_by_id: dict[str, TaskDefinition] = {}

    async def emit(self, category: EventCategory, message: str, agent_id: str | None = None, task_id: str | None = None) -> None:
        event = RuntimeEvent(run_id=self.run_id, category=category, message=message, agent_id=agent_id, task_id=task_id)
        async with self.session_factory() as session:
            session.add(EventRow(
                id=event.id,
                run_id=event.run_id,
                category=event.category.value,
                agent_id=agent_id,
                task_id=task_id,
                message=message,
                payload_json="{}",
                timestamp=event.timestamp
            ))
            await session.commit()
        await event_bus.publish(event)

    def _effective_model(self, agent: AgentDefinition) -> str:
        model = agent.model_config_.model.strip()
        if model:
            return model
        provider = agent.model_config_.provider.lower().replace("_", "-")
        return DEFAULT_MODELS.get(provider, DEFAULT_MODELS.get("openai", "gpt-4o-mini"))

    async def _complete(self, agent: AgentDefinition, prompt: str, system_override: str | None = None) -> tuple[str, int, int]:
        """Invoke agent model with provider independence."""
        system_prompt = system_override if system_override is not None else ContextRouter.build_system_instructions(agent)
        try:
            response = await provider_for(agent.model_config_.provider, self.provider_keys, agent.api_key).complete(
                model=self._effective_model(agent),
                system=system_prompt,
                prompt=prompt,
                temperature=agent.model_config_.temperature,
                max_tokens=agent.model_config_.max_tokens
            )
            return response.text, response.input_tokens, response.output_tokens
        except ProviderError as exc:
            return f"No provider response: {exc}", 0, 0

    async def _execute_task(
        self,
        task_id: str,
        dag: TaskDAG,
        manager_id: str
    ) -> tuple[str, str, int, int]:
        """Execute a single task with isolated context routing and structured handoffs."""
        task_def = self.task_defs_by_id[task_id]
        agent = self.agents_by_id.get(task_def.assigned_agent_id) or self.organization.agents[0]

        # Update status to RUNNING
        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            if row:
                row.status, row.started_at = TaskStatus.RUNNING.value, datetime.utcnow()
                await session.commit()

        dag.mark_running(task_id)
        task_def.status = TaskStatus.RUNNING
        await self.emit(EventCategory.TASK_STARTED, f"{agent.name} started task: {task_def.title}", agent.id, task_id)

        # Gather direct upstream parent task definitions for context routing
        upstream_tasks = [
            self.task_defs_by_id[parent_id]
            for parent_id in task_def.dependencies
            if parent_id in self.task_defs_by_id
        ]

        # Build isolated minimal context prompt
        task_prompt = ContextRouter.build_task_prompt(agent, task_def, self.objective, upstream_tasks)

        # Invoke model
        text, in_tokens, out_tokens = await self._complete(agent, task_prompt)
        failed = text.startswith("No provider response:")

        # Parse structured handoff output
        handoff = parse_structured_handoff(text)
        result_payload = {
            "text": text,
            "summary": handoff.summary,
            "deliverables": handoff.deliverables,
            "decisions": handoff.decisions,
            "handoff_context": handoff.handoff_context
        }

        # Update task definition result
        task_def.result = result_payload

        # Update DB
        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            if row:
                row.status = (TaskStatus.FAILED if failed else TaskStatus.COMPLETED).value
                row.completed_at = datetime.utcnow()
                row.result_json = json.dumps(result_payload)
                row.error = text if failed else None
                row.cost_json = json.dumps({"input_tokens": in_tokens, "output_tokens": out_tokens, "estimated_cost": 0.0})
                await session.commit()

        if failed:
            dag.mark_failed(task_id)
            task_def.status = TaskStatus.FAILED
            await self.emit(EventCategory.TASK_FAILED, f"{agent.name} failed task: {task_def.title}", agent.id, task_id)
        else:
            dag.mark_completed(task_id)
            task_def.status = TaskStatus.COMPLETED
            await self.emit(EventCategory.TASK_COMPLETED, f"{agent.name} completed task: {task_def.title}", agent.id, task_id)

        return agent.name, text, in_tokens, out_tokens

    async def run(self) -> None:
        """Main execution engine: Decomposition -> Routing -> DAG -> Isolated Wave Execution -> Synthesis"""
        managers = [a for a in self.organization.agents if a.agent_type.value == "MANAGER"]
        lead_agent = managers[0] if managers else next((a for a in self.organization.agents if a.agent_type.value != "HUMAN"), None)
        if lead_agent is None:
            await self.finish(RunStatus.FAILED, {"error": "Add at least one AI agent before running the organization."})
            return

        await self.set_status(RunStatus.RUNNING)
        await self.emit(EventCategory.RUN_STARTED, "Workforce run started")
        await self.emit(EventCategory.OBJECTIVE_RECEIVED, self.objective, lead_agent.id)

        # ── Step 1: Task Decomposition & Capability Routing ────────────────
        await self.emit(EventCategory.AGENT_THINKING, f"{lead_agent.name} is decomposing objective into minimal specialist tasks", lead_agent.id)

        decomposer = TaskDecomposer(self._complete)
        try:
            decomposed_tasks = await decomposer.decompose_and_route(self.objective, self.organization.agents, lead_agent)
        except Exception as exc:
            await self.finish(RunStatus.FAILED, {"error": f"Task decomposition failed: {exc}"})
            return

        # ── Step 2: Map Temp IDs to UUIDs & Persist Tasks in DB ─────────────
        temp_to_real_id: dict[str, str] = {dt.temp_id: str(uuid4()) for dt in decomposed_tasks}
        task_dag = TaskDAG()

        for dt in decomposed_tasks:
            real_task_id = temp_to_real_id[dt.temp_id]
            real_deps = [temp_to_real_id[dep] for dep in dt.dependencies if dep in temp_to_real_id]

            # Register in TaskDAG
            task_dag.add_task(real_task_id, real_deps)

            # Create TaskDefinition memory object
            task_def = TaskDefinition(
                id=real_task_id,
                organization_id=self.organization.id,
                run_id=self.run_id,
                title=dt.title,
                description=dt.description,
                assigned_agent_id=dt.assigned_agent_id,
                requested_by_agent_id=lead_agent.id,
                status=TaskStatus.PENDING,
                dependencies=real_deps,
                expected_output=dt.expected_output,
                created_at=datetime.utcnow()
            )
            self.task_defs_by_id[real_task_id] = task_def

            # Persist to SQLite
            async with self.session_factory() as session:
                session.add(TaskRow(
                    id=task_def.id,
                    organization_id=task_def.organization_id,
                    run_id=task_def.run_id,
                    title=task_def.title,
                    description=task_def.description,
                    assigned_agent_id=task_def.assigned_agent_id,
                    requested_by_agent_id=task_def.requested_by_agent_id,
                    status=task_def.status.value,
                    created_at=task_def.created_at
                ))
                await session.commit()

            assigned_agent = self.agents_by_id.get(dt.assigned_agent_id)
            assigned_name = assigned_agent.name if assigned_agent else dt.assigned_agent_id
            await self.emit(EventCategory.TASK_CREATED, f"Delegated '{dt.title}' to {assigned_name}", dt.assigned_agent_id, real_task_id)

        # ── Step 3: Compute Execution Waves (Parallel Staging) ─────────────
        execution_waves = task_dag.get_execution_waves()

        # ── Step 4: Execute Parallel Waves with Context Isolation ──────────
        for wave_idx, wave_task_ids in enumerate(execution_waves):
            # Check if run was cancelled
            async with self.session_factory() as session:
                run_row = await session.get(RunRow, self.run_id)
                if run_row and run_row.status == RunStatus.CANCELLED.value:
                    return

            ready_tasks = [tid for tid in wave_task_ids if task_dag.nodes[tid].status == TaskStatus.PENDING]
            if not ready_tasks:
                continue

            # Execute wave tasks concurrently using asyncio.gather
            await asyncio.gather(*(self._execute_task(tid, task_dag, lead_agent.id) for tid in ready_tasks))

        # ── Step 5: Final Synthesis ─────────────────────────────────────────
        completed_tasks = [t for t in self.task_defs_by_id.values() if t.status == TaskStatus.COMPLETED]
        usable_outputs: list[tuple[str, str]] = []

        for t in completed_tasks:
            agent = self.agents_by_id.get(t.assigned_agent_id)
            agent_name = agent.name if agent else "Specialist"
            result_dict = t.result if isinstance(t.result, dict) else {}
            text_out = result_dict.get("text") or ""
            if text_out and not text_out.startswith("No provider response:"):
                usable_outputs.append((f"{agent_name} ({t.title})", text_out))

        await self.emit(EventCategory.AGENT_THINKING, f"{lead_agent.name} is synthesizing team output", lead_agent.id)

        if usable_outputs:
            material = "\n\n".join(f"## {title}\n{text}" for title, text in usable_outputs)
            final_prompt = (
                f"### Objective Summary\n{self.objective}\n\n"
                f"### Team Completed Deliverables\n{material}\n\n"
                "### Final Response Requirements\n"
                "Synthesize the team's deliverables into a clear, cohesive final response. Highlight completed deliverables, key decisions, and next steps."
            )
            final_text, _, _ = await self._complete(lead_agent, final_prompt)
        else:
            final_text = "The organization could not obtain model responses. Configure a valid provider key and model in Settings, then run again."

        await self.finish(RunStatus.COMPLETED, {
            "text": final_text,
            "contributors": [title for title, _ in usable_outputs]
        })

    async def set_status(self, status: RunStatus) -> None:
        async with self.session_factory() as session:
            row = await session.get(RunRow, self.run_id)
            if row:
                row.status = status.value
                if status == RunStatus.RUNNING:
                    row.started_at = datetime.utcnow()
                await session.commit()

    async def finish(self, status: RunStatus, result: dict[str, Any]) -> None:
        async with self.session_factory() as session:
            row = await session.get(RunRow, self.run_id)
            if not row or row.status == RunStatus.CANCELLED.value:
                return
            row.status = status.value
            row.result_json = json.dumps(result)
            row.completed_at = datetime.utcnow()
            await session.commit()
        await self.emit(
            EventCategory.RUN_COMPLETED if status == RunStatus.COMPLETED else EventCategory.RUN_FAILED,
            "Workforce run completed" if status == RunStatus.COMPLETED else result.get("error", "Run failed")
        )

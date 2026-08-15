"""Safe local workforce runtime with Dynamic Non-Linear Agent Communication."""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.events.event_bus import event_bus
from backend.models.domain import (
    AgentDefinition, EventCategory, OrganizationDefinition,
    RunStatus, RuntimeEvent, TaskDefinition, TaskStatus,
)
from backend.providers.base import ProviderError
from backend.providers.registry import provider_for
from backend.runtime.context_router import ContextRouter, parse_structured_handoff
from backend.runtime.dag import TaskDAG
from backend.runtime.decomposer import DecomposedTask, TaskDecomposer
from backend.runtime.messenger import AgentMessage, AgentMessenger
from backend.runtime.project_verifier import ProjectVerifier, VerificationIssue, VerificationReport
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

# Regex that matches the peer-ask JSON block an agent may emit
_ASK_RE = re.compile(
    r'```json\s*\{[^`]*"ask"\s*:\s*"(?P<target>[^"]+)"[^`]*"subject"\s*:\s*"(?P<subject>[^"]+)"[^`]*"question"\s*:\s*"(?P<question>[^"]+)"[^`]*\}\s*```',
    re.DOTALL | re.IGNORECASE,
)

_DELEGATE_RE = re.compile(
    r'```json\s*\{[^`]*"delegate"\s*:\s*"(?P<target>[^"]+)"[^`]*"title"\s*:\s*"(?P<title>[^"]+)"[^`]*"description"\s*:\s*"(?P<description>[^"]+)"(?:[^`]*"expected_output"\s*:\s*"(?P<expected>[^"]+)")?[^`]*\}\s*```',
    re.DOTALL | re.IGNORECASE,
)

_TOKEN_LIMIT_REASONS = {"length", "max_tokens", "max_tokens_reached", "max_tokens_exceeded", "max_output_tokens", "max_output_tokens_reached"}


class WorkforceOrchestrator:
    # Maximum times a single task may be re-run after receiving a peer reply
    MAX_ASK_ROUNDS = 3
    MAX_CONTINUATION_ROUNDS = 3
    MAX_DYNAMIC_TASKS = 24

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

        self.agents_by_id: dict[str, AgentDefinition] = {a.id: a for a in organization.agents}
        self.task_defs_by_id: dict[str, TaskDefinition] = {}
        self.repair_outputs: list[tuple[str, str]] = []
        self.repair_outputs_with_agent: list[tuple[str, str, str]] = []
        self.repair_agents_by_source: dict[str, str] = {}
        self.messenger = AgentMessenger(run_id)

    # ── Emit ──────────────────────────────────────────────────────────────────

    async def emit(
        self,
        category: EventCategory,
        message: str,
        agent_id: str | None = None,
        task_id: str | None = None,
    ) -> None:
        event = RuntimeEvent(
            run_id=self.run_id, category=category, message=message,
            agent_id=agent_id, task_id=task_id,
        )
        async with self.session_factory() as session:
            session.add(EventRow(
                id=event.id, run_id=event.run_id, category=event.category.value,
                agent_id=agent_id, task_id=task_id, message=message,
                payload_json="{}", timestamp=event.timestamp,
            ))
            await session.commit()
        await event_bus.publish(event)

    # ── LLM call ──────────────────────────────────────────────────────────────

    def _effective_model(self, agent: AgentDefinition) -> str:
        model = agent.model_config_.model.strip()
        if model:
            return model
        provider = agent.model_config_.provider.lower().replace("_", "-")
        return DEFAULT_MODELS.get(provider, DEFAULT_MODELS.get("openai", "gpt-4o-mini"))

    async def _complete_with_reason(
        self,
        agent: AgentDefinition,
        prompt: str,
        system_override: str | None = None,
    ) -> tuple[str, int, int, str]:
        system_prompt = (
            system_override
            if system_override is not None
            else ContextRouter.build_system_instructions(agent)
        )
        try:
            response = await provider_for(
                agent.model_config_.provider, self.provider_keys, agent.api_key
            ).complete(
                model=self._effective_model(agent),
                system=system_prompt,
                prompt=prompt,
                temperature=agent.model_config_.temperature,
                max_tokens=agent.model_config_.max_tokens,
            )
            return response.text, response.input_tokens, response.output_tokens, response.finish_reason
        except ProviderError as exc:
            return f"No provider response: {exc}", 0, 0, "error"

    async def _complete(
        self,
        agent: AgentDefinition,
        prompt: str,
        system_override: str | None = None,
    ) -> tuple[str, int, int]:
        """Compatibility wrapper for planning and concise manager calls."""
        text, input_tokens, output_tokens, _ = await self._complete_with_reason(
            agent, prompt, system_override
        )
        return text, input_tokens, output_tokens

    async def _complete_long_task(
        self, agent: AgentDefinition, prompt: str
    ) -> tuple[str, int, int]:
        """Continue an artifact response if the provider reports a token cutoff."""
        text, total_input, total_output, reason = await self._complete_with_reason(agent, prompt)
        chunks = [text]
        for _ in range(self.MAX_CONTINUATION_ROUNDS):
            if reason.lower() not in _TOKEN_LIMIT_REASONS:
                break
            continuation_prompt = (
                f"{prompt}\n\n### Continuation Required\n"
                "Your previous response stopped because the output limit was reached. "
                "Continue exactly from where it stopped. Do not repeat any earlier content, "
                "and finish every open code fence and remaining file.\n\n"
                "### Tail of Previous Response\n"
                f"{chunks[-1][-12000:]}"
            )
            next_text, next_input, next_output, reason = await self._complete_with_reason(
                agent, continuation_prompt
            )
            total_input += next_input
            total_output += next_output
            if next_text.startswith("No provider response:"):
                break
            chunks.append(next_text)
        return "".join(chunks), total_input, total_output

    # ── Peer routing helpers ──────────────────────────────────────────────────

    def _find_agent_by_role_or_name(self, target: str) -> AgentDefinition | None:
        """Fuzzy-match an agent by role or name for peer routing."""
        target_lower = target.lower()
        # Exact match first
        for agent in self.organization.agents:
            if agent.name.lower() == target_lower or agent.role.lower() == target_lower:
                return agent
        # Partial match
        for agent in self.organization.agents:
            if target_lower in agent.name.lower() or target_lower in agent.role.lower():
                return agent
        return None

    async def _handle_peer_ask(
        self,
        asking_agent: AgentDefinition,
        target_name: str,
        subject: str,
        question: str,
        task_id: str,
    ) -> str:
        """Route a peer question to the target agent and await the reply."""
        target = self._find_agent_by_role_or_name(target_name)
        if target is None:
            return f"[Agent '{target_name}' not found — proceeding without clarification.]"

        if not self.messenger.can_ask(asking_agent.id, target.id):
            return f"[Max exchanges reached with {target.name} — proceeding with best judgement.]"

        msg = AgentMessage(
            id=str(uuid4()),
            run_id=self.run_id,
            from_agent_id=asking_agent.id,
            from_agent_name=asking_agent.name,
            to_agent_id=target.id,
            to_agent_name=target.name,
            subject=subject,
            body=question,
        )
        self.messenger.send(msg)

        await self.emit(
            EventCategory.AGENT_MESSAGE_SENT,
            f"{asking_agent.name} → {target.name}: {subject}",
            asking_agent.id,
            task_id,
        )
        await self.emit(
            EventCategory.AGENT_BLOCKED,
            f"{asking_agent.name} is waiting for reply from {target.name}",
            asking_agent.id,
            task_id,
        )

        # Ask the target agent to answer
        answer_prompt = (
            f"### Incoming Question from {asking_agent.name}\n"
            f"**Subject:** {subject}\n\n"
            f"{question}\n\n"
            "Reply concisely and directly. Your answer will be passed back to the asking agent."
        )
        reply_text, _, _ = await self._complete(target, answer_prompt)
        self.messenger.reply(msg.id, reply_text)

        await self.emit(
            EventCategory.AGENT_MESSAGE_REPLIED,
            f"{target.name} → {asking_agent.name}: replied to '{subject}'",
            target.id,
            task_id,
        )
        await self.emit(
            EventCategory.AGENT_UNBLOCKED,
            f"{asking_agent.name} received reply from {target.name} and will continue",
            asking_agent.id,
            task_id,
        )
        return reply_text

    async def _inject_task(
        self, requesting_agent: AgentDefinition, parent_task_id: str,
        target_name: str, title: str, description: str, expected_output: str,
        dag: TaskDAG,
    ) -> bool:
        """Add a runtime-requested follow-on task without creating a cycle."""
        if len(self.task_defs_by_id) >= self.MAX_DYNAMIC_TASKS:
            await self.emit(EventCategory.AGENT_BLOCKED,
                f"Dynamic-task limit reached; {requesting_agent.name}'s request was not added.",
                requesting_agent.id, parent_task_id)
            return False
        target = self._find_agent_by_role_or_name(target_name)
        if target is None or target.agent_type.value == "HUMAN":
            await self.emit(EventCategory.AGENT_BLOCKED,
                f"{requesting_agent.name} requested work from unavailable agent '{target_name}'.",
                requesting_agent.id, parent_task_id)
            return False

        task_id = str(uuid4())
        dag.add_task(task_id, [parent_task_id])
        task_def = TaskDefinition(
            id=task_id, organization_id=self.organization.id, run_id=self.run_id,
            parent_task_id=parent_task_id, title=title, description=description,
            assigned_agent_id=target.id, requested_by_agent_id=requesting_agent.id,
            status=TaskStatus.PENDING, dependencies=[parent_task_id],
            expected_output=expected_output or "Complete the follow-up with an explicit handoff.",
        )
        self.task_defs_by_id[task_id] = task_def
        async with self.session_factory() as session:
            session.add(TaskRow(
                id=task_def.id, organization_id=task_def.organization_id,
                run_id=task_def.run_id, parent_task_id=task_def.parent_task_id,
                title=task_def.title, description=task_def.description,
                assigned_agent_id=task_def.assigned_agent_id,
                requested_by_agent_id=task_def.requested_by_agent_id,
                status=task_def.status.value,
                dependencies_json=json.dumps(task_def.dependencies),
                expected_output=task_def.expected_output, created_at=task_def.created_at,
            ))
            await session.commit()
        await self.emit(EventCategory.TASK_CREATED,
            f"{requesting_agent.name} dynamically delegated '{title}' to {target.name}",
            target.id, task_id)
        return True

    # ── Task execution with peer communication ────────────────────────────────

    async def _execute_task(
        self,
        task_id: str,
        dag: TaskDAG,
        manager_id: str,
    ) -> tuple[str, str, int, int]:
        task_def = self.task_defs_by_id[task_id]
        agent = self.agents_by_id.get(task_def.assigned_agent_id) or self.organization.agents[0]

        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            if row:
                row.status, row.started_at = TaskStatus.RUNNING.value, datetime.utcnow()
                await session.commit()

        dag.mark_running(task_id)
        task_def.status = TaskStatus.RUNNING
        await self.emit(
            EventCategory.TASK_STARTED,
            f"{agent.name} started task: {task_def.title}",
            agent.id,
            task_id,
        )

        upstream_tasks = [
            self.task_defs_by_id[pid]
            for pid in task_def.dependencies
            if pid in self.task_defs_by_id
        ]

        total_in_tokens = 0
        total_out_tokens = 0
        peer_messages: list[dict] = []
        final_text = ""

        for ask_round in range(self.MAX_ASK_ROUNDS + 1):
            task_prompt = ContextRouter.build_task_prompt(
                agent, task_def, self.objective, upstream_tasks, peer_messages or None
            )
            text, in_tok, out_tok = await self._complete_long_task(agent, task_prompt)
            total_in_tokens += in_tok
            total_out_tokens += out_tok

            if text.startswith("No provider response:"):
                final_text = text
                break

            # Check whether the agent wants to ask a peer
            ask_match = _ASK_RE.search(text)
            if ask_match and ask_round < self.MAX_ASK_ROUNDS:
                target_name = ask_match.group("target")
                subject = ask_match.group("subject")
                question = ask_match.group("question")

                reply = await self._handle_peer_ask(
                    agent, target_name, subject, question, task_id
                )
                # Record the exchange so the next prompt includes it
                peer_messages.append({
                    "from": target_name,
                    "to": agent.name,
                    "subject": subject,
                    "body": question,
                    "reply": reply,
                    "resolved": True,
                })
                # Loop — re-run the task with the new context
                continue

            # No peer-ask found (or max rounds reached) — accept this output
            final_text = text
            break

        # Any agent may request a follow-on task after discovering missing work.
        # The new node depends on this task, which keeps feedback loops finite.
        for delegate_match in _DELEGATE_RE.finditer(final_text):
            await self._inject_task(
                agent, task_id, delegate_match.group("target"),
                delegate_match.group("title"), delegate_match.group("description"),
                delegate_match.group("expected") or "", dag,
            )

        failed = final_text.startswith("No provider response:")
        handoff = parse_structured_handoff(final_text)
        result_payload = {
            "text": final_text,
            "summary": handoff.summary,
            "deliverables": handoff.deliverables,
            "decisions": handoff.decisions,
            "handoff_context": handoff.handoff_context,
            "peer_exchanges": peer_messages,
        }
        task_def.result = result_payload

        async with self.session_factory() as session:
            row = await session.get(TaskRow, task_id)
            if row:
                row.status = (TaskStatus.FAILED if failed else TaskStatus.COMPLETED).value
                row.completed_at = datetime.utcnow()
                row.result_json = json.dumps(result_payload)
                row.error = final_text if failed else None
                row.cost_json = json.dumps({
                    "input_tokens": total_in_tokens,
                    "output_tokens": total_out_tokens,
                    "estimated_cost": 0.0,
                })
                await session.commit()

        if failed:
            dag.mark_failed(task_id)
            task_def.status = TaskStatus.FAILED
            await self.emit(
                EventCategory.TASK_FAILED,
                f"{agent.name} failed task: {task_def.title}",
                agent.id,
                task_id,
            )
        else:
            dag.mark_completed(task_id)
            task_def.status = TaskStatus.COMPLETED
            await self.emit(
                EventCategory.TASK_COMPLETED,
                f"{agent.name} completed task: {task_def.title}"
                + (f" (asked {len(peer_messages)} peer question(s))" if peer_messages else ""),
                agent.id,
                task_id,
            )

        return agent.name, final_text, total_in_tokens, total_out_tokens

    # ── Artifact helpers ──────────────────────────────────────────────────────

    def _artifact_outputs(self) -> list[tuple[str, str, str]]:
        outputs: list[tuple[str, str, str]] = []
        for task in self.task_defs_by_id.values():
            result = task.result if isinstance(task.result, dict) else {}
            text = result.get("text") or ""
            if text and not text.startswith("No provider response:"):
                outputs.append((task.id, task.assigned_agent_id, text))
        for source, agent_id, output in self.repair_outputs_with_agent:
            outputs.append((source, agent_id, output))
        return outputs

    @staticmethod
    def _format_verification_issues(report: VerificationReport) -> str:
        if not report.issues:
            return "No verification issues."
        ambiguous_count = sum(1 for i in report.issues if i.code == "ambiguous_file_path")
        other_issues = [i for i in report.issues if i.code != "ambiguous_file_path"]
        lines = [
            f"- [{issue.code}] {issue.path or 'project'}: {issue.message}"
            for issue in other_issues
        ]
        if ambiguous_count:
            lines.insert(
                0,
                f"- [ambiguous_file_path] {ambiguous_count} code block(s) are missing explicit "
                "relative file paths; agents must include a path in the code fence header "
                "(e.g. ```tsx frontend/src/App.tsx).",
            )
        return "\n".join(lines)

    # ── Verification ──────────────────────────────────────────────────────────

    async def _verify_and_repair(self, lead_agent: AgentDefinition) -> VerificationReport:
        verifier = ProjectVerifier(self.objective)
        await self.emit(
            EventCategory.VERIFICATION_STARTED,
            "Verification is checking generated artifacts, manifests, entrypoints, and syntax.",
            lead_agent.id,
        )
        report = verifier.verify(self._artifact_outputs())
        if report.passed:
            await self.emit(
                EventCategory.VERIFICATION_PASSED,
                f"Verification complete. {len(report.files)} file(s) ready to export.",
                lead_agent.id,
            )
        else:
            await self.emit(
                EventCategory.VERIFICATION_FAILED,
                f"Verification found {len(report.issues)} advisory issue(s) — export proceeding: "
                + self._format_verification_issues(report),
                lead_agent.id,
            )
            report.passed = bool(report.files)
        return report

    # ── Main run loop ─────────────────────────────────────────────────────────

    async def run(self) -> None:
        managers = [a for a in self.organization.agents if a.agent_type.value == "MANAGER"]
        lead_agent = managers[0] if managers else next(
            (a for a in self.organization.agents if a.agent_type.value != "HUMAN"), None
        )
        if lead_agent is None:
            await self.finish(RunStatus.FAILED, {
                "error": "Add at least one AI agent before running the organization."
            })
            return

        await self.set_status(RunStatus.RUNNING)
        await self.emit(EventCategory.RUN_STARTED, "Workforce run started")
        await self.emit(EventCategory.OBJECTIVE_RECEIVED, self.objective, lead_agent.id)

        # ── Step 1: Task Decomposition ─────────────────────────────────────
        await self.emit(
            EventCategory.AGENT_THINKING,
            f"{lead_agent.name} is decomposing objective into specialist tasks",
            lead_agent.id,
        )
        decomposer = TaskDecomposer(self._complete)
        try:
            decomposed_tasks = await decomposer.decompose_and_route(
                self.objective, self.organization.agents, lead_agent
            )
        except Exception as exc:
            await self.finish(RunStatus.FAILED, {"error": f"Task decomposition failed: {exc}"})
            return

        # ── Step 2: Persist Tasks & Build DAG ─────────────────────────────
        temp_to_real_id: dict[str, str] = {dt.temp_id: str(uuid4()) for dt in decomposed_tasks}
        task_dag = TaskDAG()

        for dt in decomposed_tasks:
            real_task_id = temp_to_real_id[dt.temp_id]
            real_deps = [temp_to_real_id[dep] for dep in dt.dependencies if dep in temp_to_real_id]
            task_dag.add_task(real_task_id, real_deps)

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
                created_at=datetime.utcnow(),
            )
            self.task_defs_by_id[real_task_id] = task_def

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
                    dependencies_json=json.dumps(task_def.dependencies),
                    expected_output=task_def.expected_output,
                    created_at=task_def.created_at,
                ))
                await session.commit()

            assigned_agent = self.agents_by_id.get(dt.assigned_agent_id)
            assigned_name = assigned_agent.name if assigned_agent else dt.assigned_agent_id
            await self.emit(
                EventCategory.TASK_CREATED,
                f"Delegated '{dt.title}' to {assigned_name}",
                dt.assigned_agent_id,
                real_task_id,
            )

        # ── Step 3: Execute Waves with Peer Communication ──────────────────
        # Re-evaluate readiness after every batch. Unlike precomputed waves,
        # this includes tasks injected by agents while the run is in progress.
        while True:
            async with self.session_factory() as session:
                run_row = await session.get(RunRow, self.run_id)
                if run_row and run_row.status == RunStatus.CANCELLED.value:
                    return

            ready_tasks = task_dag.get_ready_tasks()
            if not ready_tasks:
                pending = [
                    node for node in task_dag.nodes.values()
                    if node.status == TaskStatus.PENDING
                ]
                if pending:
                    await self.emit(
                        EventCategory.RUN_FAILED,
                        "Workforce has pending tasks with unresolved dependencies.",
                        lead_agent.id,
                    )
                break

            await asyncio.gather(*(
                self._execute_task(tid, task_dag, lead_agent.id)
                for tid in ready_tasks
            ))

        # ── Step 4: Advisory Verification & Deliverables ──────────────────
        verification = await self._verify_and_repair(lead_agent)

        completed_tasks = [
            t for t in self.task_defs_by_id.values()
            if t.status == TaskStatus.COMPLETED
        ]
        usable_outputs: list[tuple[str, str]] = []
        for t in completed_tasks:
            agent = self.agents_by_id.get(t.assigned_agent_id)
            agent_name = agent.name if agent else "Specialist"
            result_dict = t.result if isinstance(t.result, dict) else {}
            text_out = result_dict.get("text") or ""
            if text_out and not text_out.startswith("No provider response:"):
                usable_outputs.append((f"{agent_name} ({t.title})", text_out))

        # Only fail if neither exportable files NOR agent text outputs were produced
        if not verification.files and not usable_outputs:
            await self.finish(RunStatus.FAILED, {
                "text": (
                    "The organization could not obtain responses from the agents. "
                    "Please check your provider API keys and network connection in Settings."
                ),
                "verification": verification.to_dict(),
                "files": [],
                "agent_messages": self.messenger.all_messages(),
            })
            return

        # For non-technical / research tasks where agents produced text rather than code files,
        # create a deliverable markdown file so it is also available as an exportable artifact
        if not verification.files and usable_outputs:
            from backend.runtime.project_verifier import GeneratedFile
            combined_doc = "\n\n".join(f"## {title}\n\n{text}" for title, text in usable_outputs)
            verification.files.append(GeneratedFile(
                path="research-deliverable.md",
                content=f"# {self.objective.strip()}\n\n{combined_doc}\n",
                language="markdown",
                synthesized=True,
            ))

        # ── Step 5: Manager Final Synthesis ───────────────────────────────
        await self.emit(
            EventCategory.AGENT_THINKING,
            f"{lead_agent.name} is synthesizing team output",
            lead_agent.id,
        )

        all_messages = self.messenger.all_messages()
        comm_summary = ""
        if all_messages:
            comm_summary = (
                f"\n\n### Agent-to-Agent Communications ({len(all_messages)} exchange(s))\n"
                + "\n".join(
                    f"- {m['from']} → {m['to']} re: {m['subject']}"
                    for m in all_messages
                )
            )

        md_files = [f for f in verification.files if f.path.endswith(('.md', '.txt', '.markdown', '.rst', '.csv'))]
        is_document_project = bool(md_files) and len(verification.files) == len(md_files)

        final_text = ""
        if usable_outputs:
            material = "\n\n".join(f"## {title}\n{text}" for title, text in usable_outputs)
            advisory_notes = ""
            if verification.issues:
                advisory_notes = (
                    "\n\n### Advisory Warnings (non-blocking)\n"
                    + "\n".join(
                        f"- {i.code}: {i.message[:120]}"
                        for i in verification.issues[:8]
                    )
                    + ("\n- (and more...)" if len(verification.issues) > 8 else "")
                )

            if is_document_project:
                final_prompt = (
                    f"### Objective Summary\n{self.objective}\n\n"
                    f"### Team Completed Deliverables\n{material}\n\n"
                    f"### Generated Document Content\n"
                    + (md_files[0].content if md_files else "")
                    + comm_summary
                    + "\n\n### Final Response Requirements\n"
                    "Act as the lead presenter. Present the complete, detailed final deliverable / research document "
                    "directly to the user in rich, comprehensive Markdown. Include all sections, data, links, and findings. "
                    "Do not merely summarize or omit the document content; present the full report clearly."
                )
            else:
                final_prompt = (
                    f"### Objective Summary\n{self.objective}\n\n"
                    f"### Team Completed Deliverables\n{material}\n\n"
                    f"### Exported Files\n"
                    + "\n".join(f"- {file.path}" for file in verification.files)
                    + comm_summary
                    + advisory_notes
                    + "\n\n### Final Response Requirements\n"
                    "Act as the accountable manager. Summarise what was built, list the exported files, "
                    "and give clear instructions on how to run the project (install dependencies, start commands). "
                    "If agents communicated with each other during the run, briefly mention how they coordinated. "
                    "If there are advisory warnings, mention them as things to review. "
                    "Do not claim tests or runtime behaviour that was not verified."
                )
            try:
                completed_text, _, _ = await self._complete(lead_agent, final_prompt)
                if completed_text and not completed_text.startswith("No provider response:"):
                    final_text = completed_text
            except Exception:
                final_text = ""

        # Robust Fallback: If synthesis was rate-limited (429), empty, or failed, fallback to deliverable files/outputs
        if not final_text or final_text.startswith("No provider response:"):
            if md_files:
                # Deliverable research report or document directly presented to user
                final_text = md_files[0].content
            elif usable_outputs:
                final_text = "\n\n---\n\n".join(f"### {title}\n{text}" for title, text in usable_outputs)
            elif verification.files:
                final_text = f"### Deliverable ({verification.files[0].path})\n\n```\n{verification.files[0].content}\n```"
            else:
                final_text = (
                    "The organization completed execution. Please check the individual task outputs and exported files."
                )

        await self.finish(RunStatus.COMPLETED, {
            "text": final_text,
            "contributors": [title for title, _ in usable_outputs],
            "verification": verification.to_dict(),
            "files": [file.__dict__ for file in verification.files],
            "agent_messages": all_messages,
        })

    # ── Status helpers ────────────────────────────────────────────────────────

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
            "Workforce run completed"
            if status == RunStatus.COMPLETED
            else result.get("error", "Run failed"),
        )

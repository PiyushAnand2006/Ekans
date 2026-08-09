"""Task Decomposition and Capability-Based Agent Router for Ekans Runtime."""

from __future__ import annotations

import json
import re
from typing import Any
from pydantic import BaseModel, Field

from backend.models.domain import AgentDefinition, AgentType


SOFTWARE_OBJECTIVE = re.compile(
    r"\b(app|application|website|web\s+site|api|backend|frontend|codebase|software|react|python|typescript|javascript)\b",
    re.IGNORECASE,
)


class DecomposedTask(BaseModel):
    temp_id: str = Field(description="Temporary ID like 'task_1', 'task_2'")
    title: str = Field(description="Short descriptive title of the sub-task")
    description: str = Field(description="Detailed instructions and requirements for this sub-task")
    required_capability: str = Field(description="Required role or skill (e.g. 'Frontend Developer', 'Architect', 'Backend Developer')")
    dependencies: list[str] = Field(default_factory=list, description="List of temp_ids of prerequisite tasks")
    expected_output: str = Field(default_factory=str, description="Expected deliverable or artifact")
    assigned_agent_id: str = Field(default_factory=str, description="Assigned agent ID after capability routing")


class AgentRouter:
    """Capability-based router that assigns tasks to the best suited agent."""

    @staticmethod
    def calculate_capability_score(task: DecomposedTask, agent: AgentDefinition) -> float:
        score = 0.0
        req = task.required_capability.lower()
        role = agent.role.lower()
        name = agent.name.lower()

        # Role / Name exact or partial matches
        if req in role or role in req:
            score += 5.0
        if req in name or name in req:
            score += 3.0

        # Word token overlap between required capability and agent metadata
        req_words = set(re.findall(r'\w+', req))
        agent_words = set(re.findall(r'\w+', f"{name} {role} {' '.join(agent.responsibilities)} {agent.description}"))
        overlap = req_words.intersection(agent_words)
        score += len(overlap) * 1.5

        # Agent type bonuses
        if "manager" in req or "lead" in req or "coordinator" in req:
            if agent.agent_type == AgentType.MANAGER:
                score += 4.0
        elif agent.agent_type == AgentType.SPECIALIST:
            score += 1.0
        elif agent.agent_type == AgentType.REVIEWER and ("review" in req or "qa" in req or "test" in req):
            score += 4.0

        # Tool capability bonus
        for tool in agent.tools:
            if tool.lower() in req:
                score += 2.0

        return score

    @classmethod
    def route_task(cls, task: DecomposedTask, available_agents: list[AgentDefinition]) -> AgentDefinition:
        """Route a task to the agent with the highest capability score."""
        if not available_agents:
            raise ValueError("No available agents for task routing.")

        if len(available_agents) == 1:
            return available_agents[0]

        scored_agents = [
            (cls.calculate_capability_score(task, agent), agent)
            for agent in available_agents
            if agent.agent_type != AgentType.HUMAN
        ]

        if not scored_agents:
            return available_agents[0]

        scored_agents.sort(key=lambda x: x[0], reverse=True)
        best_score, best_agent = scored_agents[0]

        if best_score > 0:
            return best_agent

        specialists = [a for a in available_agents if a.agent_type == AgentType.SPECIALIST]
        return specialists[0] if specialists else available_agents[0]


class TaskDecomposer:
    """Decomposes a high-level user objective into minimal specialized tasks."""

    def __init__(self, complete_fn: Any) -> None:
        self.complete_fn = complete_fn

    async def decompose_and_route(
        self,
        objective: str,
        organization_agents: list[AgentDefinition],
        lead_agent: AgentDefinition
    ) -> list[DecomposedTask]:
        """Decompose objective into sub-tasks and map each task to the best agent."""
        ai_agents = [a for a in organization_agents if a.agent_type != AgentType.HUMAN]
        if not ai_agents:
            raise ValueError("No AI agents available in organization.")

        if len(ai_agents) == 1:
            task = DecomposedTask(
                temp_id="task_1",
                title=f"{ai_agents[0].role}: Execute objective",
                description=(
                    f"{objective}\n\nFor a software deliverable, this task also owns complete project scaffolding, "
                    "integration, verification, and run instructions."
                ),
                required_capability=ai_agents[0].role,
                dependencies=[],
                expected_output="Detailed task deliverable",
                assigned_agent_id=ai_agents[0].id
            )
            return [task]

        agent_descriptions = "\n".join(
            f"- ID: {a.id} | Name: {a.name} | Role: {a.role} | Type: {a.agent_type.value} | Responsibilities: {', '.join(a.responsibilities) or 'General'}"
            for a in ai_agents
        )

        decomposition_prompt = f"""You are an expert AI Workforce Coordinator.
Decompose the following user objective into the MINIMUM necessary specialized sub-tasks.

CRITICAL RULES:
1. Do NOT create tasks for unneeded agents. If an objective only requires 1 or 2 specialists, create ONLY those sub-tasks.
2. Ensure tasks have clear dependencies (temp_id references) for parallel or sequential execution.
3. Independent tasks (e.g. Frontend and Backend after Architecture) should have NO dependencies on each other so they run in parallel.
4. Use dependencies for real information constraints, not reporting hierarchy. Start foundational analysis, architecture, or strategy before work that needs it, but allow independent specialists to run concurrently.
5. The plan is an initial graph, not a rigid pipeline: agents can ask peers and inject bounded follow-up tasks when they discover a gap.
6. Output strictly valid JSON array with no extra markdown wrapping.
7. For a software product, web application, API, or codebase objective, include a mandatory "Project scaffolding and integration" task. It must own manifests, entrypoints, configuration, integration, and final run instructions. Make it depend on all implementation tasks.
8. For a software objective, include a "Verification and repair" task assigned to a QA/reviewer-capable agent when one is available. It must depend on the scaffolding/integration task and validate the complete artifact set against the objective.

User Objective:
{objective}

Available Team Agents:
{agent_descriptions}

Output Format:
[
  {{
    "temp_id": "task_1",
    "title": "Short title",
    "description": "Detailed instructions for this task",
    "required_capability": "Required role",
    "dependencies": [],
    "expected_output": "Description of expected deliverable"
  }}
]"""

        text, _, _ = await self.complete_fn(lead_agent, decomposition_prompt)
        decomposed_tasks = self._parse_decomposition_json(text, objective, ai_agents)
        if SOFTWARE_OBJECTIVE.search(objective):
            decomposed_tasks = self._ensure_software_workflow(decomposed_tasks)

        for task in decomposed_tasks:
            assigned = AgentRouter.route_task(task, ai_agents)
            task.assigned_agent_id = assigned.id

        return decomposed_tasks

    @staticmethod
    def _ensure_software_workflow(tasks: list[DecomposedTask]) -> list[DecomposedTask]:
        """Enforce integration and QA gates even when the planner forgets them."""
        if not tasks:
            return tasks
        used_ids = {task.temp_id for task in tasks}

        def next_id(prefix: str) -> str:
            number = 1
            while f"{prefix}_{number}" in used_ids:
                number += 1
            value = f"{prefix}_{number}"
            used_ids.add(value)
            return value

        scaffold = next((task for task in tasks if re.search(r"scaffold|integration|project setup", f"{task.title} {task.description}", re.I)), None)
        qa = next((task for task in tasks if re.search(r"verify|validation|quality|qa|test", f"{task.title} {task.description}", re.I)), None)
        implementation_ids = [task.temp_id for task in tasks if task is not qa and task is not scaffold]

        if scaffold is None:
            scaffold = DecomposedTask(
                temp_id=next_id("scaffold"),
                title="Project scaffolding and integration",
                description="Create or reconcile all manifests, entrypoints, configuration, dependency declarations, integration glue, and documented run commands for the complete generated project.",
                required_capability="Lead Architect or Engineering Manager",
                dependencies=implementation_ids,
                expected_output="A complete, runnable project structure with exact relative paths for every file.",
            )
            tasks.append(scaffold)
        else:
            scaffold.dependencies = list(dict.fromkeys([*scaffold.dependencies, *implementation_ids]))

        if qa is None:
            qa = DecomposedTask(
                temp_id=next_id("verify"),
                title="Verification and repair",
                description="Review the integrated artifact set against the user objective. Identify missing files, manifests, imports, entrypoints, and syntax issues; return complete corrected files where needed.",
                required_capability="QA Reviewer",
                dependencies=[scaffold.temp_id],
                expected_output="A verified project or precise repair artifacts with explicit paths.",
            )
            tasks.append(qa)
        elif scaffold.temp_id not in qa.dependencies:
            qa.dependencies.append(scaffold.temp_id)
        return tasks

    def _parse_decomposition_json(
        self,
        raw_text: str,
        objective: str,
        ai_agents: list[AgentDefinition]
    ) -> list[DecomposedTask]:
        """Safely parse LLM decomposition response or fall back to focused tasks."""
        try:
            match = re.search(r'\[\s*\{.*\}\s*\]', raw_text, re.DOTALL)
            json_str = match.group(0) if match else raw_text.strip()
            data = json.loads(json_str)

            tasks: list[DecomposedTask] = []
            for idx, item in enumerate(data):
                temp_id = str(item.get("temp_id") or f"task_{idx + 1}")
                title = str(item.get("title") or f"Sub-task {idx + 1}")
                description = str(item.get("description") or title)
                req_cap = str(item.get("required_capability") or "Specialist")
                deps = [str(d) for d in item.get("dependencies", []) if isinstance(d, (str, int))]
                exp_out = str(item.get("expected_output") or "Task result")

                tasks.append(DecomposedTask(
                    temp_id=temp_id,
                    title=title,
                    description=description,
                    required_capability=req_cap,
                    dependencies=deps,
                    expected_output=exp_out
                ))

            if tasks:
                return tasks
        except Exception:
            pass

        specialists = [a for a in ai_agents if a.agent_type != AgentType.MANAGER] or ai_agents
        fallback_tasks: list[DecomposedTask] = []
        for idx, agent in enumerate(specialists):
            fallback_tasks.append(DecomposedTask(
                temp_id=f"task_{idx + 1}",
                title=f"{agent.role}: Implement requirements",
                description=f"Fulfill objective for {agent.role}: {objective}",
                required_capability=agent.role,
                dependencies=[],
                expected_output=f"Deliverables for {agent.role}",
                assigned_agent_id=agent.id
            ))
        return fallback_tasks

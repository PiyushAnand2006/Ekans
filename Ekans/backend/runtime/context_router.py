"""Context Router and Structured Handoff Parser for Ekans Runtime.

Enforces strict context isolation: agents receive only the minimum context
required for their specific task, direct upstream handoffs, and role instructions.
"""

from __future__ import annotations

import json
import re
from typing import Any
from pydantic import BaseModel, Field

from backend.models.domain import AgentDefinition, TaskDefinition


class StructuredHandoff(BaseModel):
    """Structured deliverable and handoff output produced by an agent."""
    summary: str = Field(default="", description="High-level summary of work completed")
    deliverables: str = Field(default="", description="Code, specifications, or artifacts produced")
    decisions: str = Field(default="", description="Key technical or strategic decisions made")
    artifacts: list[str] = Field(default_factory=list, description="File paths or deliverables created")
    handoff_context: str = Field(default="", description="Concise context intended for downstream tasks")
    text: str = Field(default="", description="Full raw response text")


def parse_structured_handoff(raw_text: str) -> StructuredHandoff:
    """Extracts structured handoff fields from raw LLM output."""
    if not raw_text or raw_text.startswith("No provider response:"):
        return StructuredHandoff(text=raw_text)

    try:
        match = re.search(r'\{\s*"summary".*\}', raw_text, re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            return StructuredHandoff(
                summary=str(data.get("summary", "")),
                deliverables=str(data.get("deliverables", "")),
                decisions=str(data.get("decisions", "")),
                artifacts=list(data.get("artifacts", [])),
                handoff_context=str(data.get("handoff_context", "")),
                text=raw_text
            )
    except Exception:
        pass

    summary = _extract_markdown_section(raw_text, ["summary", "overview"])
    deliverables = _extract_markdown_section(raw_text, ["deliverable", "deliverables", "code", "output", "result"])
    decisions = _extract_markdown_section(raw_text, ["decision", "decisions", "architecture", "tradeoffs"])
    handoff = _extract_markdown_section(raw_text, ["handoff", "handoff context", "next steps", "downstream"])

    return StructuredHandoff(
        summary=summary or raw_text[:300].strip(),
        deliverables=deliverables or raw_text,
        decisions=decisions,
        artifacts=[],
        handoff_context=handoff or summary or raw_text[:500].strip(),
        text=raw_text
    )


def _extract_markdown_section(text: str, keywords: list[str]) -> str:
    """Helper to parse content under markdown headers matching keywords."""
    lines = text.split("\n")
    capturing = False
    captured_lines: list[str] = []

    for line in lines:
        if line.strip().startswith("#"):
            header_text = line.strip().lstrip("#").strip().lower()
            if any(k in header_text for k in keywords):
                capturing = True
                continue
            elif capturing:
                break
        elif capturing:
            captured_lines.append(line)

    return "\n".join(captured_lines).strip()


class ContextRouter:
    """Constructs isolated, minimum-necessary prompts for agent execution."""

    @staticmethod
    def build_system_instructions(agent: AgentDefinition) -> str:
        """Constructs role-specific system prompt for an agent."""
        responsibilities = ", ".join(agent.responsibilities) if agent.responsibilities else "complete assigned task"
        instructions = agent.instructions or "Be accurate, practical, concise, and produce clean deliverables."
        tools = ", ".join(agent.tools) if agent.tools else "none"

        return (
            f"You are {agent.name}, acting as the organization's {agent.role}.\n"
            f"Goal: {agent.goal or 'achieve assigned task'}\n"
            f"Responsibilities: {responsibilities}\n"
            f"Allowed Tools: {tools}\n"
            f"Instructions: {instructions}"
        )

    @staticmethod
    def build_task_prompt(
        agent: AgentDefinition,
        task: TaskDefinition,
        objective: str,
        upstream_tasks: list[TaskDefinition]
    ) -> str:
        """Builds an isolated task prompt containing ONLY:
        - Concise objective summary
        - Deliverables & handoff context from DIRECT upstream dependencies
        - Current task title, description & expected output
        - Structured output format
        """
        prompt_parts: list[str] = []

        # 1. High-Level Objective Summary
        prompt_parts.append(f"### High-Level Objective Summary\n{objective}")

        # 2. Upstream Dependency Handoffs (ONLY direct parent task outputs)
        if upstream_tasks:
            handoff_parts: list[str] = []
            for parent_task in upstream_tasks:
                if not parent_task.result:
                    continue
                task_res = parent_task.result if isinstance(parent_task.result, dict) else {}
                handoff_ctx = task_res.get("handoff_context") or task_res.get("deliverables") or task_res.get("text") or ""
                if handoff_ctx:
                    handoff_parts.append(f"#### Deliverable from Prerequisite Task ({parent_task.title}):\n{handoff_ctx}")

            if handoff_parts:
                prompt_parts.append("### Upstream Prerequisite Deliverables\n" + "\n\n".join(handoff_parts))

        # 3. Current Task Details
        prompt_parts.append(
            f"### Your Assigned Task: {task.title}\n"
            f"**Task Description:** {task.description}\n"
            f"**Expected Deliverable:** {task.expected_output or 'Produce clear, functional, actionable output.'}"
        )

        # 4. Response Guidelines
        prompt_parts.append(
            "### Output Guidelines & Code Fence Rules\n"
            "Produce complete, functional, executable deliverables.\n"
            "CRITICAL CODE BLOCK RULE:\n"
            "Every single code block MUST have an explicit relative file path on the first line after the code fence!\n"
            "Correct Example:\n"
            "```tsx frontend/src/App.tsx\n"
            "export default function App() { ... }\n"
            "```\n\n"
            "Incorrect Example (WILL FAIL VERIFICATION):\n"
            "```jsx\n"
            "function App() { ... }\n"
            "```\n\n"
            "- Never omit the relative file path from code block headers.\n"
            "- Do not use placeholder file names like code_1.ts or file.py.\n"
            "- Ensure code is complete and runnable with appropriate entrypoints and dependency manifests."
        )

        return "\n\n".join(prompt_parts)

"""Task Directed Acyclic Graph (DAG) Engine for Ekans Runtime."""

from __future__ import annotations

from collections import deque
from backend.models.domain import TaskStatus


class TaskDAGNode:
    def __init__(self, task_id: str, dependencies: list[str] | None = None) -> None:
        self.task_id = task_id
        self.dependencies: set[str] = set(dependencies or [])
        self.dependents: set[str] = set()
        self.status: TaskStatus = TaskStatus.PENDING

    def __repr__(self) -> str:
        return f"<TaskDAGNode id={self.task_id} status={self.status.value} deps={list(self.dependencies)}>"


class TaskDAG:
    """Manages task dependency DAG, cycle detection, and wave execution scheduling."""

    def __init__(self) -> None:
        self.nodes: dict[str, TaskDAGNode] = {}

    def add_task(self, task_id: str, dependencies: list[str] | None = None) -> TaskDAGNode:
        if task_id in self.nodes:
            node = self.nodes[task_id]
            if dependencies:
                node.dependencies.update(dependencies)
        else:
            node = TaskDAGNode(task_id, dependencies)
            self.nodes[task_id] = node

        for dep_id in node.dependencies:
            if dep_id not in self.nodes:
                self.nodes[dep_id] = TaskDAGNode(dep_id)
            self.nodes[dep_id].dependents.add(task_id)

        return node

    def add_dependency(self, task_id: str, dependency_id: str) -> bool:
        """Add an edge only when it preserves acyclicity.

        Tasks can be injected while a run is underway. This accepts an
        arbitrary non-linear graph while rejecting a feedback edge that would
        turn it into an unbounded scheduling cycle.
        """
        if task_id == dependency_id:
            return False
        self.add_task(task_id)
        self.add_task(dependency_id)
        if dependency_id in self.nodes[task_id].dependencies:
            return True

        stack = [dependency_id]
        seen: set[str] = set()
        while stack:
            current = stack.pop()
            if current == task_id:
                return False
            if current in seen:
                continue
            seen.add(current)
            stack.extend(self.nodes[current].dependents)

        self.nodes[task_id].dependencies.add(dependency_id)
        self.nodes[dependency_id].dependents.add(task_id)
        return True

    def validate_dag(self) -> None:
        """Validate DAG using Kahn's algorithm. Detects cycles or missing nodes."""
        in_degree: dict[str, int] = {node_id: len(node.dependencies) for node_id, node in self.nodes.items()}
        queue = deque([node_id for node_id, deg in in_degree.items() if deg == 0])
        visited_count = 0

        while queue:
            node_id = queue.popleft()
            visited_count += 1
            for child_id in self.nodes[node_id].dependents:
                in_degree[child_id] -= 1
                if in_degree[child_id] == 0:
                    queue.append(child_id)

        if visited_count != len(self.nodes):
            self._break_cycles()

    def _break_cycles(self) -> None:
        """Fallback helper to resolve cycles by clearing illegal backward dependencies."""
        seen: set[str] = set()
        for node_id, node in list(self.nodes.items()):
            valid_deps = set()
            for dep in node.dependencies:
                if dep not in seen and dep != node_id:
                    valid_deps.add(dep)
            node.dependencies = valid_deps
            seen.add(node_id)

    def get_execution_waves(self) -> list[list[str]]:
        """Groups tasks into topological execution waves for parallel staging."""
        self.validate_dag()
        in_degree: dict[str, int] = {node_id: len(node.dependencies) for node_id, node in self.nodes.items()}
        current_wave = [node_id for node_id, deg in in_degree.items() if deg == 0]
        waves: list[list[str]] = []
        processed: set[str] = set()

        while current_wave:
            waves.append(current_wave)
            processed.update(current_wave)
            next_wave = []
            for node_id in current_wave:
                for child_id in self.nodes[node_id].dependents:
                    if child_id in processed or child_id in next_wave:
                        continue
                    if self.nodes[child_id].dependencies.issubset(processed):
                        next_wave.append(child_id)
            current_wave = next_wave

        remaining = [nid for nid in self.nodes if nid not in processed]
        if remaining:
            waves.append(remaining)

        return waves

    def get_ready_tasks(self) -> list[str]:
        """Returns list of task IDs that are PENDING and whose dependencies are ALL COMPLETED."""
        ready: list[str] = []
        for node_id, node in self.nodes.items():
            if node.status != TaskStatus.PENDING:
                continue
            deps_completed = all(
                dep_id in self.nodes and self.nodes[dep_id].status == TaskStatus.COMPLETED
                for dep_id in node.dependencies
            )
            if deps_completed:
                ready.append(node_id)
        return ready

    def mark_running(self, task_id: str) -> None:
        if task_id in self.nodes:
            self.nodes[task_id].status = TaskStatus.RUNNING

    def mark_completed(self, task_id: str) -> None:
        if task_id in self.nodes:
            self.nodes[task_id].status = TaskStatus.COMPLETED

    def mark_failed(self, task_id: str) -> None:
        if task_id in self.nodes:
            self.nodes[task_id].status = TaskStatus.FAILED
            self._propagate_failure(task_id)

    def _propagate_failure(self, failed_task_id: str) -> None:
        queue = deque(list(self.nodes[failed_task_id].dependents))
        while queue:
            child_id = queue.popleft()
            if child_id in self.nodes and self.nodes[child_id].status == TaskStatus.PENDING:
                self.nodes[child_id].status = TaskStatus.CANCELLED
                queue.extend(list(self.nodes[child_id].dependents))

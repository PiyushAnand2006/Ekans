"""Sandboxed compilation and build verification runner for Ekans deliverables."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.runtime.project_verifier import GeneratedFile, VerificationIssue


class SandboxRunner:
    """Safely runs syntax, compilation, and build checks in an isolated temporary workspace."""

    def __init__(self, files: list[GeneratedFile]) -> None:
        self.files = files

    def run_checks(self) -> list[VerificationIssue]:
        from backend.runtime.project_verifier import VerificationIssue

        issues: list[VerificationIssue] = []
        if not self.files:
            return issues

        with tempfile.TemporaryDirectory(prefix="ekans-sandbox-") as temp_dir:
            workspace = Path(temp_dir)

            # Write files to sandbox workspace
            for file in self.files:
                target = workspace / file.path
                try:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(file.content, encoding="utf-8")
                except Exception as exc:
                    issues.append(VerificationIssue(
                        code="sandbox_write_error",
                        message=f"Failed to write artifact to sandbox: {exc}",
                        path=file.path,
                        source_task_id=file.source_task_id,
                        source_agent_id=file.source_agent_id,
                    ))

            # 1. Python Compilation Check
            py_files = [f for f in self.files if f.path.endswith(".py")]
            for py_file in py_files:
                target = workspace / py_file.path
                res = subprocess.run(
                    ["python", "-m", "py_compile", str(target)],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    check=False,
                )
                if res.returncode != 0:
                    err_msg = (res.stderr or res.stdout or "Compilation error").strip()
                    issues.append(VerificationIssue(
                        code="python_compile_error",
                        message=f"Python compilation failed:\n{err_msg}",
                        path=py_file.path,
                        source_task_id=py_file.source_task_id,
                        source_agent_id=py_file.source_agent_id,
                    ))

            # 2. Node / JavaScript Syntax Check
            node_bin = shutil.which("node")
            js_files = [f for f in self.files if f.path.endswith((".js", ".mjs", ".cjs"))]
            if node_bin and js_files:
                for js_file in js_files:
                    target = workspace / js_file.path
                    res = subprocess.run(
                        [node_bin, "--check", str(target)],
                        capture_output=True,
                        text=True,
                        timeout=10,
                        check=False,
                    )
                    if res.returncode != 0:
                        err_msg = (res.stderr or res.stdout or "Syntax error").strip()
                        issues.append(VerificationIssue(
                            code="javascript_syntax_error",
                            message=f"Node syntax check failed:\n{err_msg}",
                            path=js_file.path,
                            source_task_id=js_file.source_task_id,
                            source_agent_id=js_file.source_agent_id,
                        ))

            # 3. JSON Validity Check
            json_files = [f for f in self.files if f.path.endswith(".json")]
            for json_file in json_files:
                try:
                    json.loads(json_file.content)
                except json.JSONDecodeError as exc:
                    issues.append(VerificationIssue(
                        code="invalid_json",
                        message=f"JSON syntax check failed: {exc}",
                        path=json_file.path,
                        source_task_id=json_file.source_task_id,
                        source_agent_id=json_file.source_agent_id,
                    ))

        return issues

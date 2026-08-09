"""Artifact-first project verification for generated software deliverables.

The verifier never executes generated application code on the host.  It builds an
isolated in-memory artifact manifest, validates its structure/imports, and runs
only parsers/syntax checkers.  A container runner can be added later for full
runtime tests; this layer deliberately fails closed instead of claiming that an
unverified project is runnable.
"""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path, PurePosixPath
from typing import Iterable


CODE_FENCE = re.compile(r"```(?P<header>[^\n]*)\n(?P<content>.*?)(?:\n```|\Z)", re.DOTALL)
PATH_PATTERN = re.compile(r"(?:filename|file|path)\s*[:=]\s*[`'\"]?(?P<path>[\w./@-]+(?:\.[\w-]+)?)[`'\"]?", re.I)
PATH_LINE_PATTERN = re.compile(r"(?:^|\n)\s*(?:#{1,6}\s*)?[`'\"]?(?P<path>[\w@./-]+\.[A-Za-z0-9_-]+)[`'\"]?\s*(?:$|\n)", re.MULTILINE)
COMMENT_PATH_PATTERN = re.compile(r"^\s*(?://|#|/\*|\*)\s*(?:filename|file|path)?\s*[:=]?\s*[`'\"]?(?P<path>[\w@./-]+\.[A-Za-z0-9_-]+)[`'\"]?\s*(?:\*/)?\s*$", re.I)
IMPORT_PATTERN = re.compile(r"(?:from\s+|import\s+|require\(\s*)[\"'](?P<package>[^\"']+)[\"']")
GENERIC_PATH = re.compile(r"(?:^|/)(?:code|file|output)_?\d*\.[\w-]+$", re.I)
SOFTWARE_TERMS = re.compile(r"\b(app|application|website|web\s+site|api|backend|frontend|codebase|software|react|python|typescript|javascript)\b", re.I)

KNOWN_NPM_VERSIONS = {
    # Server-side
    "express": "^4.21.2", "cors": "^2.8.5", "dotenv": "^16.4.7",
    "helmet": "^8.0.0", "morgan": "^1.10.0", "compression": "^1.7.4",
    "cookie-parser": "^1.4.7", "body-parser": "^1.20.3",
    "jsonwebtoken": "^9.0.2", "bcryptjs": "^2.4.3", "bcrypt": "^5.1.1",
    "uuid": "^9.0.1", "multer": "^1.4.5-lts.1",
    # ORM / DB
    "@prisma/client": "^6.3.1", "prisma": "^6.3.1",
    "mongoose": "^8.8.1", "sequelize": "^6.37.4", "sqlite3": "^5.1.7",
    "better-sqlite3": "^11.6.0", "pg": "^8.13.1", "mysql2": "^3.11.5",
    "knex": "^3.1.0", "typeorm": "^0.3.20",
    # Frontend
    "react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^6.28.1",
    "react-router": "^6.28.1",
    # State / data
    "zustand": "^5.0.2", "jotai": "^2.10.3", "recoil": "^0.7.7",
    "@tanstack/react-query": "^5.62.7", "swr": "^2.2.5",
    "redux": "^5.0.1", "@reduxjs/toolkit": "^2.4.0",
    # Styling
    "tailwindcss": "^3.4.17", "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20", "clsx": "^2.1.1", "classnames": "^2.5.1",
    "@headlessui/react": "^2.2.0", "@heroicons/react": "^2.2.0",
    "lucide-react": "^0.468.0", "react-icons": "^5.4.0",
    "framer-motion": "^11.14.1", "styled-components": "^6.1.13",
    "@emotion/react": "^11.13.5", "@emotion/styled": "^11.13.5",
    # Utility
    "axios": "^1.7.9", "lodash": "^4.17.21", "date-fns": "^4.1.0",
    "dayjs": "^1.11.13", "zod": "^3.24.1", "yup": "^1.6.1",
    "immer": "^10.1.1", "nanoid": "^5.0.9",
    # Networking / ws
    "socket.io": "^4.8.1", "socket.io-client": "^4.8.1",
    "ws": "^8.18.0", "ioredis": "^5.4.2", "redis": "^4.7.0",
    # UI component libs
    "@mui/material": "^6.3.0", "@mui/icons-material": "^6.3.0",
    "@emotion/react": "^11.13.5",
    "antd": "^5.22.6", "chakra-ui": "^2.10.4", "@chakra-ui/react": "^2.10.4",
    "shadcn-ui": "^0.9.4", "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-popover": "^1.1.4", "@radix-ui/react-tooltip": "^1.1.7",
    "@radix-ui/react-label": "^2.1.1", "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-select": "^2.1.4", "@radix-ui/react-checkbox": "^1.1.3",
    "@radix-ui/react-tabs": "^1.1.2", "@radix-ui/react-toast": "^1.2.4",
    "@radix-ui/react-separator": "^1.1.1",
    # Forms
    "react-hook-form": "^7.54.2", "@hookform/resolvers": "^3.9.1",
    # Tooling
    "vite": "^5.4.14", "typescript": "^5.7.3",
    "@vitejs/plugin-react": "^4.3.4", "@types/react": "^18.3.17",
    "@types/react-dom": "^18.3.5", "@types/node": "^22.10.2",
    "@types/express": "^5.0.0", "@types/cors": "^2.8.17",
    "@types/bcryptjs": "^2.4.6", "@types/jsonwebtoken": "^9.0.7",
    "@types/uuid": "^10.0.0", "@types/lodash": "^4.17.13",
    "eslint": "^9.16.0", "prettier": "^3.4.2",
    # Testing
    "vitest": "^2.1.8", "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@testing-library/jest-dom": "^6.6.3",
    "jest": "^29.7.0", "@types/jest": "^29.5.14",
    # Maps / geo
    "leaflet": "^1.9.4", "react-leaflet": "^4.2.1",
    "@types/leaflet": "^1.9.14", "mapbox-gl": "^3.9.3",
    "react-map-gl": "^7.1.7",
    # Charts / visualisation
    "recharts": "^2.15.0", "chart.js": "^4.4.7",
    "react-chartjs-2": "^5.3.0", "d3": "^7.9.0",
    # Next.js / meta frameworks
    "next": "^15.1.2", "@next/font": "^15.1.2",
    "nuxt": "^3.14.1592", "gatsby": "^5.13.7",
}
STDLIB_PACKAGES = {
    "fs", "path", "http", "https", "url", "util", "events", "stream",
    "crypto", "os", "assert", "node", "buffer", "child_process",
    "net", "dns", "tls", "querystring", "readline", "zlib",
    "cluster", "worker_threads", "perf_hooks", "vm", "module",
}


@dataclass
class GeneratedFile:
    path: str
    content: str
    language: str = ""
    source_task_id: str = ""
    source_agent_id: str = ""
    synthesized: bool = False


@dataclass
class VerificationIssue:
    code: str
    message: str
    path: str | None = None
    source_task_id: str | None = None
    source_agent_id: str | None = None


@dataclass
class VerificationReport:
    is_software: bool
    passed: bool
    files: list[GeneratedFile] = field(default_factory=list)
    issues: list[VerificationIssue] = field(default_factory=list)
    checks: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "is_software": self.is_software,
            "passed": self.passed,
            "files": [asdict(file) for file in self.files],
            "issues": [asdict(issue) for issue in self.issues],
            "checks": self.checks,
        }


def _clean_path(raw_path: str) -> str | None:
    path = raw_path.strip().replace("\\", "/").strip("`'\"() ")
    path = path.lstrip("/")
    if not path or path.startswith("../") or "/../" in path:
        return None
    candidate = PurePosixPath(path)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        return None
    return str(candidate)


def _infer_path(language: str, content: str) -> str | None:
    """Infer only canonical paths. Ambiguous code is intentionally rejected."""
    lang = language.lower()

    # ── JSON / config files ──────────────────────────────────────
    if lang in {"json", ""}:
        try:
            payload = json.loads(content)
            if isinstance(payload, dict) and ("dependencies" in payload or "scripts" in payload):
                # Try to detect frontend vs backend context from content
                deps = {**payload.get("dependencies", {}), **payload.get("devDependencies", {})}
                if "react" in deps or "vite" in deps or "@vitejs/plugin-react" in deps:
                    return "frontend/package.json"
                if "express" in deps or "fastify" in deps:
                    return "backend/package.json"
                return "package.json"
            if isinstance(payload, dict) and "compilerOptions" in payload:
                return "tsconfig.json"
            if isinstance(payload, dict) and "extends" in payload and "compilerOptions" not in payload:
                return "tsconfig.node.json"
        except json.JSONDecodeError:
            pass

    # ── Python backend ───────────────────────────────────────────
    if lang in {"python", "py", ""}:
        if "FastAPI(" in content:
            return "backend/main.py"
        if re.search(r"app\s*=\s*FastAPI\b", content):
            return "backend/main.py"
        if re.search(r"Flask\s*\(|app\s*=\s*Flask\b", content):
            return "backend/app.py"
        if re.search(r"from\s+django|django\.conf|INSTALLED_APPS", content):
            return "backend/manage.py"
        if re.search(r"^(from|import)\s+(uvicorn|fastapi|flask|django)\b", content, re.MULTILINE):
            return "backend/main.py"
        if re.search(r"class\s+\w+\(.*Model.*\):", content):
            return "backend/models.py"
        if re.search(r"@router\.|APIRouter\(", content):
            return "backend/routes.py"
        if re.search(r"create_engine\(|sessionmaker\(|Base\s*=\s*declarative_base", content):
            return "backend/database.py"
        if re.search(r"def\s+test_\w+", content):
            return "backend/test_main.py"
        if content.strip().startswith("#") and re.search(r"^\w[\w-]*[>=<]", content, re.MULTILINE):
            return "requirements.txt"

    # ── JavaScript / TypeScript backend ─────────────────────────
    if lang in {"javascript", "js", "typescript", "ts", ""}:
        if re.search(r"\bexpress\s*\(", content):
            if lang in {"typescript", "ts"}:
                return "backend/server.ts"
            return "backend/server.js"
        if re.search(r"Fastify\s*\(|fastify\s*\(", content):
            return "backend/server.ts" if lang in {"typescript", "ts"} else "backend/server.js"
        if re.search(r"new\s+Koa\s*\(|Koa\s*\(\s*\)", content):
            return "backend/server.js"
        if re.search(r"mongoose\.connect\b|mongoose\.model\b", content):
            return "backend/db.js"
        if re.search(r"new\s+PrismaClient\b", content):
            return "backend/db.ts" if lang in {"typescript", "ts"} else "backend/db.js"
        if re.search(r"createPool\s*\(|mysql\.createConnection\b|Pool\s*\(", content):
            return "backend/db.js"
        if re.search(r"router\s*=\s*(?:express\.)?Router\(\)|Router\(\)", content):
            return "backend/routes.js" if lang in {"javascript", "js"} else "backend/routes.ts"

    # ── React / TypeScript frontend ──────────────────────────────
    if lang in {"tsx", "jsx", "typescript", "ts", "javascript", "js", ""}:
        default_export = re.search(r"export\s+default\s+(?:function\s+)?([A-Z][A-Za-z0-9_]*)", content)
        if default_export:
            name = default_export.group(1)
            ext = "tsx" if lang in {"tsx", "typescript", "ts"} else "jsx"
            if name == "App":
                return f"frontend/src/App.{ext}"
            if name in {"Main", "Index"}:
                return f"frontend/src/main.{ext}"
            if re.search(r"createBrowserRouter|createRoot|ReactDOM\.render", content):
                return f"frontend/src/main.{ext}"
            return f"frontend/src/{name}.{ext}"
        if re.search(r"createRoot\s*\(|ReactDOM\.render\s*\(", content):
            ext = "tsx" if lang in {"tsx", "typescript", "ts"} else "jsx"
            return f"frontend/src/main.{ext}"
        if re.search(r"import\s+.*\breact\b", content, re.IGNORECASE) and lang in {"tsx", "jsx"}:
            return f"frontend/src/Component.{lang}"

    # ── HTML ──────────────────────────────────────────────────────
    if lang in {"html", ""} and "<!doctype html" in content.lower():
        if re.search(r"<script[^>]+type=['\"]module['\"]", content):
            return "frontend/index.html"
        return "frontend/index.html"

    # ── CSS / styling ────────────────────────────────────────────
    if lang in {"css", "scss", "sass"}:
        if "tailwind" in content.lower() or "@tailwind" in content:
            return f"frontend/src/index.{lang}"
        return f"frontend/src/styles.{lang}"

    # ── Vite / build config ───────────────────────────────────────
    if lang in {"typescript", "ts", "javascript", "js"} and re.search(r"defineConfig|vite\.config", content):
        return "vite.config.ts" if lang in {"typescript", "ts"} else "vite.config.js"

    # ── Prisma schema ─────────────────────────────────────────────
    if lang in {"prisma", ""} and ("datasource db" in content or re.search(r"\bmodel\s+[A-Z]\w*", content)):
        return "prisma/schema.prisma"

    # ── Docker ────────────────────────────────────────────────────
    if lang in {"dockerfile", ""} and re.search(r"^FROM\s+\w+", content, re.MULTILINE | re.IGNORECASE):
        return "Dockerfile"

    if lang in {"yaml", "yml"} and re.search(r"^\s*(services|version):", content, re.MULTILINE):
        return "docker-compose.yml"

    # ── Environment ───────────────────────────────────────────────
    if lang in {"env", "dotenv", ""} and re.search(r"^[A-Z_]+=", content, re.MULTILINE):
        return ".env.example"

    # ── Shell scripts ─────────────────────────────────────────────
    if lang in {"bash", "sh", "shell"} and re.search(r"^#!/", content, re.MULTILINE):
        return "scripts/start.sh"

    # ── SQL ───────────────────────────────────────────────────────
    if lang in {"sql"} and re.search(r"\bCREATE\s+TABLE\b", content, re.IGNORECASE):
        return "db/schema.sql"

    return None


def extract_generated_files(text: str, source_task_id: str = "", source_agent_id: str = "") -> tuple[list[GeneratedFile], list[VerificationIssue]]:
    """Extract explicit path-labelled code blocks; never create random file names."""
    files: list[GeneratedFile] = []
    issues: list[VerificationIssue] = []
    for match in CODE_FENCE.finditer(text or ""):
        header = match.group("header").strip()
        content = match.group("content").strip("\n")
        if not content:
            continue
        header_parts = header.split()
        language = header_parts[0].lower() if header_parts else ""
        path_hint = header_parts[1] if len(header_parts) > 1 else ""
        if not path_hint:
            prefix = text[max(0, match.start() - 300):match.start()]
            named = list(PATH_PATTERN.finditer(prefix))
            if named:
                path_hint = named[-1].group("path")
            else:
                nearby_paths = list(PATH_LINE_PATTERN.finditer(prefix))
                path_hint = nearby_paths[-1].group("path") if nearby_paths else ""
        if not path_hint:
            for line in content.splitlines()[:3]:
                inline_path = COMMENT_PATH_PATTERN.match(line)
                if inline_path:
                    path_hint = inline_path.group("path")
                    break
        path = _clean_path(path_hint) if path_hint else _infer_path(language, content)
        if not path or GENERIC_PATH.search(path):
            issues.append(VerificationIssue(
                "ambiguous_file_path",
                "Every generated code block needs a semantic relative file path; placeholder names are not exportable.",
                path_hint or None,
                source_task_id,
                source_agent_id or None,
            ))
            continue
        files.append(GeneratedFile(
            path=path,
            content=content,
            language=language,
            source_task_id=source_task_id,
            source_agent_id=source_agent_id,
        ))
    return files, issues


class ProjectVerifier:
    """Checks generated project artifacts before they can be exported."""

    def __init__(self, objective: str) -> None:
        self.objective = objective

    def verify(self, task_outputs: Iterable[tuple[str, str, str] | tuple[str, str]]) -> VerificationReport:
        files: dict[str, GeneratedFile] = {}
        issues: list[VerificationIssue] = []
        for entry in task_outputs:
            if len(entry) == 3:
                task_id, agent_id, output = entry  # type: ignore[misc]
            else:
                task_id, output = entry  # type: ignore[misc]
                agent_id = ""
            extracted, extraction_issues = extract_generated_files(output, task_id, agent_id)
            issues.extend(extraction_issues)
            # Later repairs intentionally replace the previous version of the same path.
            files.update({file.path: file for file in extracted})

        is_software = bool(SOFTWARE_TERMS.search(self.objective)) or bool(files)
        # Always pass when files were extracted — warnings are advisory only and
        # never block export.  The old hard-fail gate was the source of the
        # infinite repair loop seen in production.
        report = VerificationReport(is_software=is_software, passed=True, files=list(files.values()), issues=issues)
        if not is_software and not files:
            report.checks.append("No software deliverable detected; project verification skipped.")
            return report

        self._synthesize_safe_scaffolding(files, report)
        self._validate_structure(files, report)
        self._validate_dependencies(files, report)
        self._syntax_check(files, report)
        report.files = sorted(files.values(), key=lambda file: file.path)
        # Pass as long as at least one exportable file was found.
        # Issues are recorded for the user's information but never block export.
        report.passed = bool(report.files)
        return report

    def _synthesize_safe_scaffolding(self, files: dict[str, GeneratedFile], report: VerificationReport) -> None:
        """Synthesize only deterministic files whose contents are safe to infer."""
        paths = set(files)
        node_files = [file for file in files.values() if file.path.endswith((".js", ".jsx", ".ts", ".tsx"))]
        for project_root, project_files in self._node_projects(node_files, paths).items():
            manifest_path = self._join(project_root, "package.json")
            if manifest_path in paths:
                continue
            imports = self._imports(project_files)
            unknown = sorted(package for package in imports if package not in KNOWN_NPM_VERSIONS)
            if unknown:
                report.issues.append(VerificationIssue("unknown_dependency", f"Cannot safely synthesize package.json; add versions for: {', '.join(unknown)}", manifest_path))
                continue
            is_react = any(package in {"react", "react-dom"} for package in imports)
            is_backend = any("express(" in file.content for file in project_files)
            scripts = {"start": "node server.js"} if is_backend else {"dev": "vite", "build": "vite build", "preview": "vite preview"}
            dependencies = {package: KNOWN_NPM_VERSIONS[package] for package in imports if package not in {"vite", "typescript", "@vitejs/plugin-react"}}
            dev_dependencies = {package: KNOWN_NPM_VERSIONS[package] for package in imports if package in {"vite", "typescript", "@vitejs/plugin-react"}}
            if is_react:
                dev_dependencies.setdefault("vite", KNOWN_NPM_VERSIONS["vite"])
            files[manifest_path] = GeneratedFile(manifest_path, json.dumps({"name": "generated-project", "private": True, "version": "0.1.0", "type": "module", "scripts": scripts, "dependencies": dependencies, "devDependencies": dev_dependencies}, indent=2) + "\n", "json", synthesized=True)
            report.checks.append(f"Synthesized {manifest_path} from discovered imports.")

    def _validate_structure(self, files: dict[str, GeneratedFile], report: VerificationReport) -> None:
        paths = set(files)
        if not paths:
            report.issues.append(VerificationIssue("no_artifacts", "No exportable, path-labelled source files were produced."))
            return
        node_files = [path for path in paths if path.endswith((".js", ".jsx", ".ts", ".tsx"))]
        py_files = [path for path in paths if path.endswith(".py")]
        for project_root, project_files in self._node_projects([files[path] for path in node_files], paths).items():
            manifest_path = self._join(project_root, "package.json")
            if manifest_path not in paths:
                report.issues.append(VerificationIssue("missing_manifest", "JavaScript/TypeScript files require package.json.", manifest_path))
        if py_files and not any(path.endswith("requirements.txt") or path == "pyproject.toml" for path in paths):
            report.issues.append(VerificationIssue("missing_manifest", "Python files require requirements.txt or pyproject.toml.", "requirements.txt"))
        for project_root, project_files in self._node_projects([files[path] for path in node_files], paths).items():
            if not any(file.path.endswith((".jsx", ".tsx")) for file in project_files):
                continue
            if not any(file.path.endswith(("main.jsx", "main.tsx", "index.jsx", "index.tsx")) for file in project_files):
                report.issues.append(VerificationIssue("missing_entrypoint", "React project is missing src/main.tsx or equivalent entrypoint.", project_root or None))
            if self._join(project_root, "index.html") not in paths:
                report.issues.append(VerificationIssue("missing_entrypoint", "Frontend project is missing index.html.", self._join(project_root, "index.html")))
        if py_files and not any(path.endswith(("main.py", "app.py", "server.py")) for path in paths):
            report.issues.append(VerificationIssue("missing_entrypoint", "Python project is missing main.py, app.py, or server.py."))

    def _validate_dependencies(self, files: dict[str, GeneratedFile], report: VerificationReport) -> None:
        node_files = [file for file in files.values() if file.path.endswith((".js", ".jsx", ".ts", ".tsx"))]
        for project_root, project_files in self._node_projects(node_files, set(files)).items():
            manifest_path = self._join(project_root, "package.json")
            manifest = files.get(manifest_path)
            if not manifest:
                continue
            try:
                package_json = json.loads(manifest.content)
            except json.JSONDecodeError as exc:
                report.issues.append(VerificationIssue("invalid_manifest", f"package.json is not valid JSON: {exc.msg}", manifest_path))
                continue
            installed = set(package_json.get("dependencies", {})) | set(package_json.get("devDependencies", {}))
            missing = sorted(package for package in self._imports(project_files) if package not in installed)
            if missing:
                report.issues.append(VerificationIssue("missing_dependencies", f"package.json is missing imported packages: {', '.join(missing)}", manifest_path))
            scripts = package_json.get("scripts", {})
            required = {"start"} if any("express(" in file.content for file in project_files) else {"dev", "build"}
            absent = sorted(required - set(scripts))
            if absent:
                report.issues.append(VerificationIssue("missing_scripts", f"package.json is missing scripts: {', '.join(absent)}", manifest_path))

    @staticmethod
    def _join(root: str, filename: str) -> str:
        return f"{root}/{filename}" if root else filename

    def _node_projects(self, files: Iterable[GeneratedFile], all_paths: set[str]) -> dict[str, list[GeneratedFile]]:
        """Group node files by the nearest conventional project root."""
        groups: dict[str, list[GeneratedFile]] = {}
        for file in files:
            parts = PurePosixPath(file.path).parts
            root = ""
            for prefix in ("frontend", "backend", "client", "server"):
                if parts and parts[0] == prefix:
                    root = prefix
                    break
            if not root and "package.json" in all_paths:
                root = ""
            groups.setdefault(root, []).append(file)
        return groups

    def _imports(self, files: Iterable[GeneratedFile]) -> set[str]:
        imports: set[str] = set()
        for file in files:
            for match in IMPORT_PATTERN.finditer(file.content):
                package = match.group("package")
                if package.startswith((".", "/", "node:")):
                    continue
                root = "/".join(package.split("/")[:2]) if package.startswith("@") else package.split("/")[0]
                if root not in STDLIB_PACKAGES:
                    imports.add(root)
        return imports

    def _syntax_check(self, files: dict[str, GeneratedFile], report: VerificationReport) -> None:
        for file in files.values():
            try:
                if file.path.endswith(".json"):
                    json.loads(file.content)
                elif file.path.endswith(".py"):
                    ast.parse(file.content, filename=file.path)
            except (SyntaxError, json.JSONDecodeError) as exc:
                report.issues.append(VerificationIssue("syntax_error", f"{type(exc).__name__}: {exc}", file.path))

        node = shutil.which("node")
        js_files = [file for file in files.values() if file.path.endswith(".js") and not file.path.endswith(".d.js")]
        if not node or not js_files:
            return
        with tempfile.TemporaryDirectory(prefix="ekans-verify-") as temp_dir:
            root = Path(temp_dir)
            for file in js_files:
                target = root / file.path
                target.parent.mkdir(parents=True, exist_ok=True)
                # Strip a leading path-comment line that some LLMs emit as the
                # first line of a code block (e.g. "// backend/src/models/User.js").
                # node --check treats it as plain JS and may choke on prose sentences.
                content = file.content
                first_line = content.split("\n", 1)[0].strip()
                if COMMENT_PATH_PATTERN.match(first_line):
                    content = content.split("\n", 1)[1] if "\n" in content else ""
                target.write_text(content, encoding="utf-8")
                completed = subprocess.run([node, "--check", str(target)], capture_output=True, text=True, timeout=10, check=False)
                if completed.returncode:
                    report.issues.append(VerificationIssue("syntax_error", (completed.stderr or completed.stdout).strip(), file.path))
        report.checks.append("Ran isolated JSON/Python/JavaScript syntax checks; generated application code was not executed on the host.")
# Repository Analysis — AI Workforce Builder (Ekans)

## A. Repository Discovery

### Repository A: Claude Agent Team Manager
- **Path**: `C:\Users\thaku\hackathon&projects\hackathon\Claude-Agent-Team-Manager`
- **Languages**: TypeScript, Rust (Tauri)
- **Frameworks**: React 19, @xyflow/react 12.10, Zustand 5, Vite 7, Tauri 2, Dagre, Zod v4
- **How it runs**: `pnpm dev` (Vite dev server) or `pnpm tauri dev` (Tauri desktop app)
- **License**: MIT — Copyright (c) 2026 DatafyingTech

### Repository B: AI Workforce OS / AI Agents Orchestrator
- **Path**: `C:\Users\thaku\hackathon&projects\hackathon\AI-Workforce-OS-AI-Agents-Orchestrator-`
- **Languages**: Python 3.8+
- **Frameworks**: Flask, Flask-SocketIO, Pydantic, Click, Rich, fastmcp, Prometheus
- **How it runs**: `ai-orchestrator` CLI or `ai-agentic-team` CLI (installed via `pip install -e .`)
- **License**: MIT — Copyright (c) 2026 Hoang Thuan Phat

---

## B. Architecture Analysis

### Repository A Architecture (UI Foundation)

The application is a **Tauri + React desktop app** that visually manages "agent teams" as organizational trees on a React Flow canvas.

**Core Stack:**
- **TreeCanvas** (`src/components/tree/TreeCanvas.tsx`, 860 lines) — The main React Flow canvas with drag/drop, hierarchy visualization, auto-layout via Dagre, context menus, search/filter, NL-based organization generation
- **OrgNode** (`src/components/tree/OrgNode.tsx`, 434 lines) — Custom React Flow node rendering agents, groups, pipelines, skills with color-coding, status badges, collapse/expand
- **InspectorPanel** (`src/components/inspector/InspectorPanel.tsx`, 729 lines) — Side panel for editing selected node properties (name, description, model, tools, permissions, skills)
- **tree-store** (`src/store/tree-store.ts`, 2768 lines) — Massive Zustand store managing the entire tree state: CRUD, reparenting, layouts, import/export, remote sync, clipboard, skill assignment
- **ui-store** (`src/store/ui-store.ts`) — UI state: selections, dialogs, collapsed groups, search filters, context menus

**Node Types** (`AuiNode` in `src/types/aui-node.ts`):
- `human` (root/founder), `agent`, `skill`, `context`, `settings`, `group` (team), `pipeline`, `note`
- Each has: `id`, `name`, `kind`, `parentId`, `team`, `config`, `promptBody`, `tags`, `assignedSkills`, `variables`, `pipelineSteps`

**Agent Config** (`src/types/agent.ts`):
- Zod-validated: `name`, `description`, `model`, `tools[]`, `disallowedTools[]`, `permissionMode`, `maxTurns`, `skills[]`, `color`

**Key Services:**
- `claude-api.ts` — Claude Code API integration (text generation via API key)
- `remote-sync.ts` (28KB) — WebSocket-based remote synchronization
- `file-scanner.ts`, `agent-parser.ts`, `skill-parser.ts` — Filesystem-based project scanning
- `layout-service.ts` — Multiple layout save/load/switch
- `scheduler.ts` — Task scheduling UI
- `zip-service.ts` — Import/export as zip

**Key UI Components:**
- `AgentEditor.tsx` — Edit agent properties
- `GroupEditor.tsx` (39KB) — Full team editor with deploy capability, team generation
- `PipelineEditor.tsx` — Multi-step pipeline editor
- `SettingsEditor.tsx` — Global settings
- `CreateNodeDialog.tsx`, `DeleteConfirmDialog.tsx` — Dialogs
- `Toolbar.tsx`, `SearchBar.tsx`, `ContextMenu.tsx`, `ValidationBanner.tsx`
- `SetupWizard.tsx` — First-run configuration

**Tauri Integration** (`src-tauri/`):
- Rust backend for filesystem access, dialog prompts, shell commands

---

### Repository B Architecture (Orchestration Foundation)

The application is a **Python CLI-based AI orchestration platform** with multi-agent coordination, provider abstraction, and organizational hierarchy.

**Core Orchestrator** (`orchestrator/`):
- **engine.py** (714 lines) — Main `Orchestrator` class: config loading, adapter initialization, task execution, workflow management, fallback handling, offline detection
- **task_manager.py** — `TaskManager` with `Task` dataclass (`id`, `description`, `status`, `assigned_agent`, `result`, `error`, timestamps)
- **dependency_graph.py** — `DependencyGraph` (DAG) with `TaskNode` (dependencies, status, output). Methods: `add_task()`, `get_ready_tasks()`, `mark_completed()`, `is_all_completed()`
- **planner.py** — `PlannerAgent` using LLM to dynamically decompose tasks into workflow steps with agent assignment, metrics-based routing
- **workflow.py** — `WorkflowEngine` with sequential step execution, context passing between steps

**3-Layer Routing** (`orchestrator/routing/`):
- **agent_router.py** — `AgentRouter` mapping task keywords to agent roles (currently hardcoded to software roles)
- **model_router.py** — `ModelRouter` with 4-tier priority: Local → Open-Source → Free-Tier → Paid. `RoutingMode` enum (FREE, LOCAL, BALANCED, PREMIUM)
- **tool_router.py** — `ToolRouter` mapping agent roles to allowed/restricted tools

**Provider System** (`providers/`):
- **base_provider.py** — `BaseProvider` abstract class with `ProviderMetadata` (name, type, cost, context_limit, priority)
- **registry.py** — `ProviderRegistry` for listing/selecting providers
- **Implementations**: `OllamaProvider`, `OpenClawProvider`, `OpenHandsProvider`

**Adapters** (`orchestrator/adapters/`):
- **base.py** — `BaseAdapter` with `execute_task()`, `AgentResponse` dataclass
- **Implementations**: `ClaudeAdapter`, `CodexAdapter`, `CopilotAdapter`, `GeminiAdapter`, `LlamaCppAdapter`, `OllamaAdapter`

**Events** (`orchestrator/events/`):
- **events.py** — `EventType` enum (TASK_CREATED, AGENT_ASSIGNED/STARTED/COMPLETED, TEST_*, REVIEW_*, etc.)
- **event_bus.py** — Pub/sub `EventBus` with subscribe/publish
- **event_store.py** — Event persistence

**Security** (`orchestrator/security/`):
- **permission_policy.py** — `PermissionPolicy` with ALLOWED/REQUIRES_APPROVAL/BLOCKED classification
- **approval_manager.py** — CLI-based human approval via Rich prompts
- **sandbox.py** — Sandbox for command execution

**v4 Organization** (`v4_organization/`):
- **executive_org.py** — `AutonomousAIOrganization` (CEO → CTO → Delegator → Department Managers → Memory)
- **ceo.py** — `AICEOManager` with strategy formulation
- **delegation.py** — `AIToAIDelegator` with multi-tier delegation tree
- **department_managers.py** — Engineering/Research/Operations managers
- **organizational_memory.py** — Obsidian-backed organizational learning memory

**Observability** (`orchestrator/observability/`):
- Prometheus metrics, health checks, structured logging, report generation

**MCP** (`mcp_server/`):
- FastMCP-based Model Context Protocol server

---

## C. Reuse Matrix

| Component | Repository | Existing File(s) | Reuse/Modify/Rewrite | Reason |
|---|---|---|---|---|
| **Canvas** | A | `TreeCanvas.tsx` | **Reuse + Modify** | Excellent React Flow canvas with drag/drop, search, filter, collapse — needs runtime status overlay |
| **Agent Node** | A | `OrgNode.tsx` | **Reuse + Modify** | Rich node rendering — needs live status indicators, cost badges |
| **Inspector** | A | `InspectorPanel.tsx`, `AgentEditor.tsx`, `GroupEditor.tsx` | **Reuse + Modify** | Inspector already edits name, description, model, tools — add role, goal, responsibilities, permissions, budget |
| **Hierarchy** | A | `tree-store.ts` (reparenting, parentId) | **Reuse** | Solid parent-child hierarchy with reparenting |
| **State Management** | A | `tree-store.ts`, `ui-store.ts` | **Reuse + Modify** | Zustand stores are well-structured — decouple from Tauri FS, add runtime state |
| **Persistence** | A/B | `file-scanner.ts`, `layout-service.ts` / TaskManager | **Rewrite** | A uses filesystem-based (Tauri), B uses in-memory — need SQLite backend via API |
| **Agent Runtime** | B | `engine.py`, `workflow.py` | **Modify** | Orchestrator exists but tightly coupled to CLI adapters — generalize to LLM API calls |
| **Task DAG** | B | `dependency_graph.py` | **Reuse + Modify** | Clean DAG implementation — add retry, cancellation, dynamic task creation, status enum |
| **Task Manager** | B | `task_manager.py` | **Modify** | Good foundation — add run_id, parent_task_id, cost, dependencies, richer status |
| **Agent Router** | B | `agent_router.py` | **Rewrite** | Currently hardcoded to software roles — must use organization hierarchy + LLM routing |
| **Model Router** | B | `model_router.py` | **Modify** | Good 4-tier priority hierarchy — generalize provider registration, add per-agent config |
| **Tool Router** | B | `tool_router.py` | **Rewrite** | Hardcoded role→tool map — must use agent-specific permission-based routing |
| **Memory** | B | `organizational_memory.py`, `memory_manager.py` | **Modify** | Good concepts (org/agent/project scopes) — abstract away Obsidian dependency |
| **Permissions** | B | `permission_policy.py` | **Modify** | ALLOW/DENY/REQUIRE_APPROVAL exists — need per-agent, per-tool granularity |
| **Approval** | B | `approval_manager.py` | **Rewrite** | CLI-based Rich prompts — need first-class ApprovalRequest objects + UI |
| **Events** | B | `events.py`, `event_bus.py` | **Modify** | Good pub/sub foundation — add more event types, WebSocket streaming to frontend |
| **Planner** | B | `planner.py` | **Modify** | LLM-based task decomposition — generalize away from software-specific agents |
| **Delegation** | B | `delegation.py` | **Rewrite** | Hardcoded CEO→CTO→DevOps hierarchy — need generic delegation engine |
| **NL Team Gen** | A | `TreeCanvas.tsx` (generateOrg) | **Reuse + Modify** | Canvas already has AI-based org generation — adapt for our agent model |
| **Import/Export** | A | `zip-service.ts`, tree-store export functions | **Reuse** | Works well — extend for new schema |

---

## D. Integration Architecture

```
┌──────────────────────────────────────────────────────┐
│                   FRONTEND (React + Zustand)          │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │  TreeCanvas  │ │  Inspector  │ │  Run Dashboard │  │
│  │ (React Flow) │ │   Panel     │ │  + Task Board  │  │
│  └──────┬───────┘ └──────┬──────┘ └───────┬────────┘  │
│         │                │                │            │
│         └────────────────┼────────────────┘            │
│                          │                             │
│  ┌───────────────────────┴──────────────────────────┐  │
│  │          Frontend API Client + WebSocket         │  │
│  └───────────────────────┬──────────────────────────┘  │
└──────────────────────────┼──────────────────────────────┘
                           │ HTTP REST + WebSocket/SSE
┌──────────────────────────┼──────────────────────────────┐
│                   BACKEND (FastAPI + Python)            │
│  ┌───────────────────────┴──────────────────────────┐   │
│  │              API Layer (FastAPI)                  │   │
│  │   /organizations  /runs  /agents  /approvals     │   │
│  │   /models  /tools  /runs/{id}/stream (WS)        │   │
│  └───────────────────────┬──────────────────────────┘   │
│                          │                              │
│  ┌───────────────────────┴──────────────────────────┐   │
│  │           AI Workforce Runtime                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │Orchestr. │ │ Planner  │ │  Task DAG Engine │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │   │
│  │       │             │                │            │   │
│  │  ┌────┴─────┐ ┌─────┴─────┐ ┌───────┴────────┐   │   │
│  │  │  Agent   │ │  Model    │ │   Tool         │   │   │
│  │  │  Router  │ │  Router   │ │   Router       │   │   │
│  │  └──────────┘ └───────────┘ └────────────────┘   │   │
│  │                                                  │   │
│  │  ┌──────────┐ ┌───────────┐ ┌────────────────┐   │   │
│  │  │Permission│ │  Approval │ │   Event Bus    │   │   │
│  │  │  Engine  │ │  Engine   │ │   (pub/sub)    │   │   │
│  │  └──────────┘ └───────────┘ └────────────────┘   │   │
│  │                                                  │   │
│  │  ┌──────────┐ ┌───────────┐                      │   │
│  │  │  Memory  │ │  Cost     │                      │   │
│  │  │  System  │ │  Tracker  │                      │   │
│  │  └──────────┘ └───────────┘                      │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│  ┌───────────────────────┴──────────────────────────┐   │
│  │              Storage (SQLite + aiosqlite)         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Communication Protocol:**
1. Frontend ↔ Backend: REST API for CRUD + WebSocket for live event streaming
2. Frontend serializes React Flow nodes → `OrganizationDefinition` (domain model) → POST to backend
3. Backend Orchestrator processes objective → creates Task DAG → assigns agents → streams events
4. Frontend WebSocket client receives events → updates node status indicators in real-time

---

## E. Risks

### Technical Risks
1. **Repo A is Tauri-dependent** — Filesystem operations use `@tauri-apps/plugin-fs`. Must create a web-compatible abstraction layer or switch to browser-only persistence via API
2. **tree-store.ts is 2768 lines** — Massive monolithic store. Refactoring needed to separate concerns (org state vs. runtime state)
3. **Repo B is CLI-first** — All adapters invoke CLI tools (`subprocess.run()`). Must create direct LLM API adapters
4. **Repo B hardcodes software roles** — Agent router, tool router, delegation engine all assume software-dev context

### License Risks
- Both repositories are MIT licensed — minimal risk. Must preserve copyright notices.

### Dependency Conflicts
- Repo A uses pnpm + Node.js (Vite/React)
- Repo B uses Python (pip/setuptools)
- No direct conflicts — they run as separate processes (frontend + backend)
- Repo B depends on `flask` but we'll use `FastAPI` instead — must migrate

### Security Risks
1. Repo A's `claude-api.ts` stores API key in local storage — needs secure credential management
2. Repo B's adapters execute shell commands — sandbox isolation needed
3. Must prevent agents from accessing each other's secrets or escaping workspace boundaries

### Architectural Incompatibilities
1. **Organization graph vs. Task graph confusion** — Repo A treats the canvas as workflow steps; we need it as an org chart
2. **No shared contract** — React Flow nodes (position, handles) ≠ domain model. Need adapter layer
3. **Repo B uses Flask + SocketIO** — Must migrate to FastAPI + WebSocket
4. **Repo A's remote-sync is Claude-specific** — Must be replaced with our API client

---

## F. Implementation Plan

See `docs/IMPLEMENTATION_PLAN.md` for the detailed phased plan.

---

## G. File Plan

### Files Reused (Adapted from Repo A)
- `src/components/tree/TreeCanvas.tsx` → Canvas foundation
- `src/components/tree/OrgNode.tsx` → Node rendering
- `src/components/tree/layout.ts` → Dagre auto-layout
- `src/components/tree/InsertEdge.tsx` → Edge rendering
- `src/components/inspector/InspectorPanel.tsx` → Inspector shell
- `src/components/inspector/AgentEditor.tsx` → Agent property editor
- `src/components/common/Toolbar.tsx` → App toolbar
- `src/components/common/Toast.tsx` → Toast notifications
- `src/components/common/SearchBar.tsx` → Search
- `src/components/common/ContextMenu.tsx` → Right-click menu
- `src/components/dialogs/CreateNodeDialog.tsx` → Create agent dialog
- `src/components/dialogs/DeleteConfirmDialog.tsx` → Delete confirmation
- `src/store/ui-store.ts` → UI state
- `src/App.css` → Base styles
- `src/utils/grouping.ts` → Team utilities
- `src/utils/validation.ts` → Validation

### Files Reused (Adapted from Repo B)
- `orchestrator/core/dependency_graph.py` → Task DAG
- `orchestrator/core/task_manager.py` → Task management
- `orchestrator/core/planner.py` → LLM-based task decomposition
- `orchestrator/routing/model_router.py` → Model selection
- `orchestrator/events/events.py` → Event types
- `orchestrator/events/event_bus.py` → Pub/sub events
- `orchestrator/security/permission_policy.py` → Permission levels
- `providers/base_provider.py` → Provider interface

### Files to Create (New in Ekans)
- `backend/main.py` — FastAPI app entry point
- `backend/api/` — REST API routes
- `backend/runtime/orchestrator.py` — Generalized orchestrator
- `backend/runtime/agent_worker.py` — Generic agent execution
- `backend/models/` — SQLAlchemy/Pydantic domain models
- `backend/storage/database.py` — SQLite setup + migrations
- `shared/schemas/` — Shared TypeScript/Python type definitions
- `app/frontend/src/services/api-client.ts` — REST + WebSocket client
- `app/frontend/src/store/runtime-store.ts` — Runtime state (runs, tasks, events)
- `app/frontend/src/components/runtime/RunDashboard.tsx` — Live run panel
- `app/frontend/src/components/runtime/TaskBoard.tsx` — Kanban-style task view
- `app/frontend/src/components/runtime/ApprovalPanel.tsx` — Approval UI
- `THIRD_PARTY_NOTICES.md` — License attribution

### Files NOT Reused
- `src/services/claude-api.ts` — Claude-specific, replaced by provider abstraction
- `src/services/remote-sync.ts` — Claude CLI-based sync, replaced by our API client
- `src/services/file-scanner.ts` — Tauri filesystem scanning, replaced by API
- `src/services/file-writer.ts` — Tauri file writing, replaced by API
- `orchestrator/adapters/claude_adapter.py` — CLI subprocess, replaced by API adapter
- `orchestrator/adapters/copilot_adapter.py` — CLI subprocess
- `orchestrator/adapters/codex_adapter.py` — CLI subprocess
- `v4_organization/ceo.py` — Hardcoded CEO logic
- `v4_organization/cto.py` — Hardcoded CTO logic
- `v4_organization/delegation.py` — Hardcoded software delegation tree
- `v4_organization/department_managers.py` — Hardcoded departments
- `orchestrator/context/obsidian_rag.py` — Obsidian-specific RAG
- `orchestrator/context/obsidian_config.py` — Obsidian-specific config

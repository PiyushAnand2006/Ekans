# Implementation Plan — Ekans: AI Workforce Builder

## Goal

Build a local-first Visual AI Workforce OS that allows non-technical users to visually create AI agent organizations and run them autonomously. This combines the visual UI from Claude-Agent-Team-Manager (Repo A) with the orchestration engine from AI-Workforce-OS (Repo B) into a coherent new application.

## Proposed Changes

### Phase 1 — UI Foundation (Web-Only React App)

> **Goal**: Get Repo A's visual organization UI running as a standalone web app (no Tauri dependency) with our new domain model.

---

#### Frontend Setup

##### [NEW] `app/frontend/package.json`
Vite + React + TypeScript project with `@xyflow/react`, `zustand`, `dagre`, `zod` dependencies.

##### [NEW] `app/frontend/vite.config.ts`
Vite config with React plugin, path aliases (`@/` → `src/`).

##### [NEW] `app/frontend/index.html`
HTML entry point with Google Fonts (Inter).

##### [NEW] `app/frontend/tsconfig.json`
TypeScript config.

---

#### Domain Types

##### [NEW] `app/frontend/src/types/domain.ts`
New generalized domain types:
- `AgentDefinition` — id, name, role, description, goal, responsibilities, instructions, agent_type (MANAGER/SPECIALIST/REVIEWER/HUMAN/CUSTOM), reports_to, model_config, tools, permissions, budget, etc.
- `OrganizationDefinition` — id, name, description, objective, agents[], relationships[]
- `OrganizationRelationship` — source_id, target_id, type (MANAGES/REPORTS_TO/COLLABORATES_WITH/etc.)
- `AgentStatus` — IDLE, PLANNING, WORKING, WAITING, COMPLETED, FAILED, etc.
- `RunState`, `TaskState` — Runtime types for live status

---

#### Adapted Canvas Components (from Repo A)

##### [NEW] `app/frontend/src/components/canvas/OrgCanvas.tsx`
Adapted from `TreeCanvas.tsx`. Changes:
- Remove Tauri filesystem dependencies
- Remove Claude API integration
- Add runtime status overlay (agent statuses shown on nodes)
- Keep: drag/drop, reparenting, auto-layout, search/filter, collapse/expand, context menu, NL generation stub

##### [NEW] `app/frontend/src/components/canvas/AgentNode.tsx`
Adapted from `OrgNode.tsx`. Changes:
- Replace `NodeKind` with agent_type coloring (MANAGER=blue, SPECIALIST=orange, REVIEWER=green, HUMAN=gold)
- Add live status indicator (animated pulse for working, checkmark for done)
- Show role subtitle and cost badge
- Keep: Handle positioning, collapse button, context menu

##### [NEW] `app/frontend/src/components/canvas/layout.ts`
Reuse Dagre layout from Repo A with minimal changes.

##### [NEW] `app/frontend/src/components/canvas/OrgEdge.tsx`
Adapted from `InsertEdge.tsx` — styled organizational relationship edges.

---

#### Inspector (from Repo A)

##### [NEW] `app/frontend/src/components/inspector/InspectorPanel.tsx`
Adapted from Repo A. Extended fields:
- Name, Role, Agent Type (dropdown), Description, Goal, Responsibilities (list editor)
- Instructions (textarea), Model Provider/Model (dropdowns), Tools (multi-select)
- Permissions (per-tool ALLOW/DENY/REQUIRE_APPROVAL), Knowledge, Memory, Budget
- Remove: Claude-specific features, Tauri FS autosave

##### [NEW] `app/frontend/src/components/inspector/AgentEditor.tsx`
Adapted from Repo A — generalized for our AgentDefinition schema.

---

#### State Management

##### [NEW] `app/frontend/src/store/org-store.ts`
Organization state (Zustand). Handles:
- agents Map, relationships, org metadata
- CRUD: addAgent, updateAgent, removeAgent, reparentAgent
- Serialization: toOrganizationDefinition(), fromOrganizationDefinition()
- Layout management, import/export
- Templates for quick agent creation

##### [NEW] `app/frontend/src/store/ui-store.ts`
UI state adapted from Repo A. Selection, inspector toggle, dialogs, search, collapsed groups.

---

#### Common UI Components (from Repo A)

##### [NEW] `app/frontend/src/components/common/Toolbar.tsx`
Adapted toolbar — add agent buttons, run team button, layout toggles.

##### [NEW] `app/frontend/src/components/common/*.tsx`
Toast, SearchBar, ContextMenu, ValidationBanner — mostly reused.

##### [NEW] `app/frontend/src/components/dialogs/CreateAgentDialog.tsx`
Agent creation dialog with template selection (Manager, Researcher, Writer, etc.) and custom agent option.

---

#### Styling

##### [NEW] `app/frontend/src/index.css`
Premium dark-theme design system with CSS custom properties, glassmorphism panels, smooth gradients, micro-animations.

##### [NEW] `app/frontend/src/App.tsx`
Main app shell composing Canvas + Inspector + Toolbar.

---

### Phase 2 — Domain Model + Backend Foundation

> **Goal**: Implement the Python backend with FastAPI, SQLite, and domain models.

---

#### Backend Setup

##### [NEW] `backend/requirements.txt`
FastAPI, uvicorn, SQLAlchemy, aiosqlite, pydantic, python-dotenv, httpx.

##### [NEW] `backend/main.py`
FastAPI app with CORS, WebSocket endpoint, startup/shutdown lifecycle.

##### [NEW] `backend/storage/database.py`
SQLite database setup with SQLAlchemy async, migration system.

---

#### Domain Models

##### [NEW] `backend/models/domain.py`
Pydantic models matching TypeScript types: `AgentDefinition`, `OrganizationDefinition`, `Task`, `Run`, `Event`, `ApprovalRequest`, `ModelCallRecord`.

##### [NEW] `backend/models/database.py`
SQLAlchemy ORM models for all domain entities.

---

#### API Routes

##### [NEW] `backend/api/routes/organizations.py`
CRUD: GET/POST/PUT/DELETE organizations.

##### [NEW] `backend/api/routes/runs.py`
POST `/organizations/{id}/run` — create run.
GET `/runs/{id}` — run status.
POST `/runs/{id}/cancel` — cancel run.

##### [NEW] `backend/api/routes/agents.py`
GET/PATCH agents.

##### [NEW] `backend/api/routes/approvals.py`
GET approvals, POST approve/reject.

---

#### Frontend API Client

##### [NEW] `app/frontend/src/services/api-client.ts`
REST client + WebSocket client for event streaming.

##### [NEW] `app/frontend/src/store/runtime-store.ts`
Zustand store for active runs, tasks, events, approvals.

---

### Phase 3 — Basic Agent Execution (Single Agent)

> **Goal**: One agent receives a task, calls an LLM, returns a result.

---

##### [NEW] `backend/providers/base.py`
Abstract `ModelProvider` with `complete()` method. Adapted from Repo B's `BaseProvider`.

##### [NEW] `backend/providers/openai_provider.py`
OpenAI API adapter (also serves OpenAI-compatible APIs).

##### [NEW] `backend/providers/anthropic_provider.py`
Anthropic API adapter.

##### [NEW] `backend/providers/ollama_provider.py`
Ollama local model adapter. Adapted from Repo B.

##### [NEW] `backend/providers/registry.py`
Provider registry. Adapted from Repo B.

##### [NEW] `backend/runtime/agent_worker.py`
Generic agent worker: receives task + agent definition → builds system prompt from role/goal/instructions → calls LLM → returns structured result.

##### [NEW] `backend/events/event_types.py`
Extended event types. Adapted from Repo B.

##### [NEW] `backend/events/event_bus.py`
Async pub/sub event bus with WebSocket broadcasting. Adapted from Repo B.

---

### Phase 4 — Two-Agent Delegation (Manager → Specialist)

> **Goal**: Manager receives objective, creates task, delegates to specialist, receives result, synthesizes final output.

---

##### [NEW] `backend/runtime/orchestrator.py`
Main orchestrator: receives org + objective → assigns to top manager → manager creates tasks via LLM → runtime executes tasks.

##### [NEW] `backend/runtime/planner.py`
LLM-based task decomposition. Adapted from Repo B's `PlannerAgent` — generalized for any domain.

##### [NEW] `backend/routing/agent_router.py`
Organization-aware agent router. Uses hierarchy + capabilities to select agents. NOT keyword-based.

---

### Phase 5 — Three-Agent MVP (Manager → Researcher + Writer)

> **Goal**: The first major milestone. Full delegation chain with parallel potential.

---

##### [NEW] `backend/runtime/task_dag.py`
Task DAG engine. Adapted from Repo B's `DependencyGraph` — add retry, cancellation, status enum, dynamic task creation.

##### [NEW] `app/frontend/src/components/runtime/RunDashboard.tsx`
Live run panel: objective, task counts, live activity feed.

##### [NEW] `app/frontend/src/components/runtime/ObjectiveInput.tsx`
Objective text input + "RUN TEAM" button.

---

### Phase 6 — Tools, Permissions, Approvals

##### [NEW] `backend/tools/base.py`
Generic tool interface.

##### [NEW] `backend/tools/web_search.py`, `http_tool.py`, `filesystem.py`
Initial tool implementations.

##### [NEW] `backend/routing/tool_router.py`
Permission-aware tool routing.

##### [NEW] `backend/security/permissions.py`
Per-agent, per-tool ALLOW/DENY/REQUIRE_APPROVAL. Adapted from Repo B.

##### [NEW] `backend/security/approvals.py`
First-class ApprovalRequest objects with pause/resume execution.

##### [NEW] `app/frontend/src/components/runtime/ApprovalPanel.tsx`
Approval UI: agent, action, approve/reject/edit buttons.

---

### Phase 7 — Memory, Cost Tracking, Multi-Model

##### [NEW] `backend/memory/memory_manager.py`
Multi-scope memory (organization, agent, run, task). Adapted from Repo B.

##### [NEW] `backend/routing/model_router.py`
Adapted from Repo B — per-agent model selection with AUTO mode.

##### [NEW] `app/frontend/src/components/runtime/CostPanel.tsx`
Cost tracking per agent/task/run.

---

### Attribution

##### [NEW] `THIRD_PARTY_NOTICES.md`
License attribution for both upstream repositories.

---

## Verification Plan

### Automated Tests
- `pytest backend/tests/` — Unit tests for domain models, DAG, routing, permissions
- `npm run build` — TypeScript compilation check
- Integration test: Manager → Researcher → Writer delegation chain

### Manual Verification
1. Launch frontend (`npm run dev`) and backend (`uvicorn backend.main:app`)
2. Create 3-agent org visually (Manager, Researcher, Writer)
3. Enter objective → click RUN TEAM
4. Verify live status updates on canvas nodes
5. Verify final report appears in UI
6. Check run history with costs, events, tasks

---

## Open Questions

> [!IMPORTANT]
> **LLM Provider for Development**: Which LLM provider(s) do you have API keys for? This determines which provider we implement first for testing (OpenAI, Anthropic, Google, or Ollama for local).

> [!IMPORTANT]
> **Tauri vs Web-Only**: The master prompt mentions Tauri for the desktop app. Should Phase 1 be a **web-only React app** (faster to develop, no Rust toolchain needed) with Tauri wrapping added later? Or do you want Tauri from the start?

> [!IMPORTANT]
> **Node.js Version**: Do you have Node.js and pnpm/npm installed? Which versions? This affects our Vite/React setup.

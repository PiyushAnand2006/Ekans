# Architecture — AI Workforce Builder (Ekans)

## System Overview

Ekans is a **Visual AI Workforce Operating System** — a local-first desktop application that allows non-technical users to visually create teams of AI agents as organizational charts, then give the organization an objective and watch it autonomously decompose, delegate, execute, and report results.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     DESKTOP APPLICATION                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              FRONTEND (React + TypeScript)              │  │
│  │                                                        │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Org Canvas  │  │  Inspector   │  │     Run      │  │  │
│  │  │(React Flow) │  │   Panel      │  │  Dashboard   │  │  │
│  │  │             │  │              │  │              │  │  │
│  │  │ • Drag/Drop │  │ • Agent Edit │  │ • Live Feed  │  │  │
│  │  │ • Hierarchy │  │ • Role/Goal  │  │ • Task Board │  │  │
│  │  │ • Auto-Layout│ │ • Tools      │  │ • Approvals  │  │  │
│  │  │ • NL-Gen    │  │ • Permissions│  │ • Costs      │  │  │
│  │  │ • Live Status│ │ • Model Cfg  │  │ • History    │  │  │
│  │  └─────────────┘  └──────────────┘  └──────────────┘  │  │
│  │                                                        │  │
│  │  ┌────────────────────────────────────────────────────┐│  │
│  │  │              State Management (Zustand)            ││  │
│  │  │  org-store  │  runtime-store  │  ui-store          ││  │
│  │  └────────────────────────────────────────────────────┘│  │
│  │                         │                              │  │
│  │  ┌────────────────────────────────────────────────────┐│  │
│  │  │        API Client (REST + WebSocket)               ││  │
│  │  └───────────────────────┬────────────────────────────┘│  │
│  └──────────────────────────┼─────────────────────────────┘  │
│                             │                                │
│                      HTTP/WebSocket                          │
│                             │                                │
│  ┌──────────────────────────┼─────────────────────────────┐  │
│  │             BACKEND (Python + FastAPI)                  │  │
│  │                          │                              │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │                API Layer                         │   │  │
│  │  │  /organizations  /runs  /agents  /approvals      │   │  │
│  │  │  /models  /tools  /runs/{id}/stream              │   │  │
│  │  └──────────────────────┬───────────────────────────┘   │  │
│  │                         │                               │  │
│  │  ┌──────────────────────┴───────────────────────────┐   │  │
│  │  │           WORKFORCE RUNTIME                      │   │  │
│  │  │                                                  │   │  │
│  │  │  ┌────────────┐  ┌───────────┐  ┌────────────┐  │   │  │
│  │  │  │Orchestrator│  │  Planner  │  │  Task DAG  │  │   │  │
│  │  │  │            │  │  (LLM)    │  │  Engine    │  │   │  │
│  │  │  └─────┬──────┘  └─────┬─────┘  └──────┬─────┘  │   │  │
│  │  │        │               │               │        │   │  │
│  │  │  ┌─────┴──────┐  ┌────┴─────┐  ┌──────┴─────┐  │   │  │
│  │  │  │   Agent    │  │  Model   │  │   Tool     │  │   │  │
│  │  │  │   Router   │  │  Router  │  │   Router   │  │   │  │
│  │  │  └────────────┘  └──────────┘  └────────────┘  │   │  │
│  │  │                                                  │   │  │
│  │  │  ┌────────────┐  ┌──────────┐  ┌────────────┐  │   │  │
│  │  │  │ Permission │  │ Approval │  │  Event Bus │  │   │  │
│  │  │  │   Engine   │  │  Engine  │  │  (pub/sub) │  │   │  │
│  │  │  └────────────┘  └──────────┘  └────────────┘  │   │  │
│  │  │                                                  │   │  │
│  │  │  ┌────────────┐  ┌──────────┐                   │   │  │
│  │  │  │   Memory   │  │   Cost   │                   │   │  │
│  │  │  │   System   │  │ Tracker  │                   │   │  │
│  │  │  └────────────┘  └──────────┘                   │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                         │                               │  │
│  │  ┌──────────────────────┴───────────────────────────┐   │  │
│  │  │            Storage Layer (SQLite)                 │   │  │
│  │  │  organizations │ agents │ runs │ tasks │ events   │   │  │
│  │  │  approvals │ memory │ model_calls │ settings      │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Key Design Principles

### 1. Organization Graph ≠ Task Graph
The canvas represents WHO works with WHOM (org structure). The Task DAG represents WHAT happens in WHAT ORDER (execution). These are distinct data structures.

### 2. LLMs Decide, Runtime Controls
LLMs suggest task decomposition and delegation. The runtime validates, persists, schedules, and enforces permissions. LLMs never directly control state.

### 3. Provider Agnostic
No single LLM provider is mandatory. The system supports OpenAI, Anthropic, Google, Ollama, and OpenAI-compatible APIs through a `ModelProvider` abstraction.

### 4. Role Agnostic
No roles are hardcoded. Any role (Marketing Manager, Legal Researcher, etc.) is a configuration on a generic `AgentDefinition`.

### 5. Local-First
All processing runs locally. SQLite for storage, local Python for runtime, LLM API calls for intelligence. No cloud infrastructure required.

## Domain Models

### AgentDefinition
```
AgentDefinition {
  id: UUID
  name: string
  role: string
  description: string
  goal: string
  responsibilities: string[]
  instructions: string
  agent_type: MANAGER | SPECIALIST | REVIEWER | HUMAN | CUSTOM
  reports_to: UUID | null
  manages: UUID[]
  model_config: { provider, model, temperature, max_tokens }
  tools: ToolRef[]
  permissions: { tool_id: ALLOW | DENY | REQUIRE_APPROVAL }
  knowledge_sources: string[]
  memory_config: { scope, max_entries }
  budget: { max_cost, currency }
  execution_config: { max_turns, timeout, retry_count }
  metadata: object
}
```

### OrganizationDefinition
```
OrganizationDefinition {
  id: UUID
  name: string
  description: string
  objective: string
  agents: AgentDefinition[]
  relationships: OrganizationRelationship[]
  tools: ToolDefinition[]
  policies: { approval_required_for, budget_limits }
  budget: { total, currency }
  memory_config: object
  metadata: object
}
```

### Task
```
Task {
  id: UUID
  organization_id: UUID
  run_id: UUID
  parent_task_id: UUID | null
  title: string
  description: string
  assigned_agent_id: UUID
  requested_by_agent_id: UUID
  status: PENDING | READY | ASSIGNED | RUNNING | WAITING | WAITING_APPROVAL | REVIEW | COMPLETED | FAILED | CANCELLED
  priority: number
  dependencies: UUID[]
  expected_output: string
  result: object
  error: string | null
  retry_count: number
  cost: { input_tokens, output_tokens, estimated_cost }
  created_at, started_at, completed_at: datetime
}
```

## Data Flow: "Run Team"

1. User clicks **RUN TEAM** with objective text
2. Frontend serializes org canvas → `OrganizationDefinition` (adapter strips React Flow specifics)
3. `POST /organizations/{id}/run` → Backend creates a `Run` record
4. Orchestrator assigns objective to top-level Manager agent
5. Manager agent (via LLM) decomposes objective into tasks
6. Runtime validates and persists tasks as `Task` objects in DAG
7. DAG engine finds ready tasks → Agent Router assigns appropriate agents
8. Agent Workers execute via Model Router → selected LLM provider
9. Tool Router grants tools per permissions → Permission Engine validates
10. Events stream via WebSocket → Frontend updates node status in real-time
11. Manager receives subordinate results, synthesizes, optionally creates more tasks
12. Final result delivered → `RUN_COMPLETED` event → UI displays final report

## Directory Structure

```
Ekans/
├── app/
│   └── frontend/
│       ├── public/
│       ├── src/
│       │   ├── components/
│       │   │   ├── canvas/        # React Flow org chart
│       │   │   ├── inspector/     # Agent property editor
│       │   │   ├── runtime/       # Run dashboard, task board, approvals
│       │   │   ├── common/        # Toolbar, search, dialogs, toast
│       │   │   └── settings/      # App settings
│       │   ├── store/
│       │   │   ├── org-store.ts   # Organization state
│       │   │   ├── runtime-store.ts # Runtime/run state
│       │   │   └── ui-store.ts    # UI state
│       │   ├── services/
│       │   │   └── api-client.ts  # REST + WebSocket client
│       │   ├── types/
│       │   │   └── domain.ts      # TypeScript domain types
│       │   └── utils/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── backend/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── organizations.py
│   │   │   ├── runs.py
│   │   │   ├── agents.py
│   │   │   ├── approvals.py
│   │   │   ├── models.py
│   │   │   └── tools.py
│   │   └── websocket.py
│   ├── runtime/
│   │   ├── orchestrator.py
│   │   ├── agent_worker.py
│   │   ├── task_dag.py
│   │   └── planner.py
│   ├── routing/
│   │   ├── agent_router.py
│   │   ├── model_router.py
│   │   └── tool_router.py
│   ├── models/
│   │   ├── domain.py       # Pydantic domain models
│   │   └── database.py     # SQLAlchemy ORM models
│   ├── providers/
│   │   ├── base.py
│   │   ├── openai_provider.py
│   │   ├── anthropic_provider.py
│   │   ├── google_provider.py
│   │   ├── ollama_provider.py
│   │   └── registry.py
│   ├── tools/
│   │   ├── base.py
│   │   ├── web_search.py
│   │   ├── http_tool.py
│   │   └── filesystem.py
│   ├── memory/
│   │   └── memory_manager.py
│   ├── security/
│   │   ├── permissions.py
│   │   └── approvals.py
│   ├── events/
│   │   ├── event_bus.py
│   │   └── event_types.py
│   ├── storage/
│   │   ├── database.py
│   │   └── migrations/
│   ├── main.py
│   └── requirements.txt
├── shared/
│   └── schemas/         # Shared type definitions
├── docs/
│   ├── REPO_ANALYSIS.md
│   ├── ARCHITECTURE.md
│   └── IMPLEMENTATION_PLAN.md
├── tests/
├── THIRD_PARTY_NOTICES.md
└── README.md
```

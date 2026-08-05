/* ================================================================
   DOMAIN TYPES — Ekans AI Workforce Builder
   Generalized agent/organization/task types.
   These are frontend-facing types. Backend Pydantic models mirror these.
   ================================================================ */

// ── Agent Types ──────────────────────────────────────────────────

export type AgentType = 'MANAGER' | 'SPECIALIST' | 'REVIEWER' | 'HUMAN' | 'CUSTOM';

export type RelationshipType =
  | 'MANAGES'
  | 'REPORTS_TO'
  | 'COLLABORATES_WITH'
  | 'REVIEWS'
  | 'DELEGATES_TO';

export type PermissionLevel = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export interface ModelConfig {
  provider: string;  // 'openai' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible'
  model: string;     // 'gpt-4o' | 'claude-sonnet-4-20250514' | etc.
  temperature: number;
  max_tokens: number;
}

export interface ToolPermission {
  tool_id: string;
  permission: PermissionLevel;
}

export interface BudgetConfig {
  max_cost: number;
  currency: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  goal: string;
  responsibilities: string[];
  instructions: string;
  agent_type: AgentType;
  reports_to: string | null;   // parent agent ID
  manages: string[];           // child agent IDs
  model_config: ModelConfig;
  tools: string[];             // tool IDs
  permissions: ToolPermission[];
  knowledge_sources: string[];
  budget: BudgetConfig;
  color: string;               // UI display color
  api_key: string;
  metadata: Record<string, unknown>;
}

// ── Organization Types ───────────────────────────────────────────

export interface OrganizationRelationship {
  id: string;
  source_id: string;   // managing agent
  target_id: string;   // managed agent
  type: RelationshipType;
}

export interface OrganizationDefinition {
  id: string;
  name: string;
  description: string;
  objective: string;
  agents: AgentDefinition[];
  relationships: OrganizationRelationship[];
  positions: Record<string, { x: number; y: number }>;
  tools: string[];
  budget: BudgetConfig;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Task Types ───────────────────────────────────────────────────

export type TaskStatus =
  | 'PENDING'
  | 'READY'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'WAITING'
  | 'WAITING_APPROVAL'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface TaskDefinition {
  id: string;
  organization_id: string;
  run_id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  assigned_agent_id: string;
  requested_by_agent_id: string;
  status: TaskStatus;
  priority: number;
  dependencies: string[];
  expected_output: string;
  result: unknown;
  error: string | null;
  retry_count: number;
  cost: { input_tokens: number; output_tokens: number; estimated_cost: number };
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ── Run Types ────────────────────────────────────────────────────

export type RunStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface RunDefinition {
  id: string;
  organization_id: string;
  objective: string;
  status: RunStatus;
  tasks: TaskDefinition[];
  total_cost: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: unknown;
}

// ── Event Types ──────────────────────────────────────────────────

export type EventCategory =
  | 'RUN_STARTED'
  | 'OBJECTIVE_RECEIVED'
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'AGENT_STARTED'
  | 'AGENT_THINKING'
  | 'AGENT_WAITING'
  | 'AGENT_COMPLETED'
  | 'TOOL_REQUESTED'
  | 'TOOL_STARTED'
  | 'TOOL_COMPLETED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED';

export interface RuntimeEvent {
  id: string;
  run_id: string;
  category: EventCategory;
  agent_id: string | null;
  task_id: string | null;
  message: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ── Approval Types ───────────────────────────────────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest {
  id: string;
  run_id: string;
  task_id: string;
  agent_id: string;
  action: string;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  created_at: string;
  resolved_at: string | null;
}

// ── Agent Status (Live UI) ───────────────────────────────────────

export type AgentStatus = 'IDLE' | 'PLANNING' | 'WORKING' | 'WAITING' | 'REVIEWING' | 'COMPLETED' | 'FAILED';

// ── Agent Templates ──────────────────────────────────────────────

export interface AgentTemplate {
  name: string;
  role: string;
  description: string;
  goal: string;
  agent_type: AgentType;
  responsibilities: string[];
  tools: string[];
  color: string;
  icon: string;  // emoji
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    name: 'Manager',
    role: 'Manager',
    description: 'Coordinates team members, delegates tasks, and synthesizes results.',
    goal: 'Successfully coordinate the team to achieve the given objective.',
    agent_type: 'MANAGER',
    responsibilities: ['Decompose objectives into tasks', 'Delegate to specialists', 'Review results', 'Synthesize final output'],
    tools: [],
    color: '#4a9eff',
    icon: '👔',
  },
  {
    name: 'Researcher',
    role: 'Researcher',
    description: 'Conducts research, gathers information, and analyzes data.',
    goal: 'Provide thorough, accurate research and analysis.',
    agent_type: 'SPECIALIST',
    responsibilities: ['Research topics', 'Gather data', 'Analyze findings', 'Summarize results'],
    tools: ['web_search', 'http'],
    color: '#8b5cf6',
    icon: '🔬',
  },
  {
    name: 'Writer',
    role: 'Writer',
    description: 'Creates written content, reports, documentation, and communications.',
    goal: 'Produce clear, well-structured written content.',
    agent_type: 'SPECIALIST',
    responsibilities: ['Write content', 'Edit drafts', 'Format documents', 'Create reports'],
    tools: ['filesystem'],
    color: '#f59e0b',
    icon: '✍️',
  },
  {
    name: 'Developer',
    role: 'Developer',
    description: 'Writes code, builds features, and implements technical solutions.',
    goal: 'Deliver clean, working code that meets requirements.',
    agent_type: 'SPECIALIST',
    responsibilities: ['Write code', 'Implement features', 'Fix bugs', 'Refactor'],
    tools: ['filesystem', 'terminal', 'git'],
    color: '#10b981',
    icon: '💻',
  },
  {
    name: 'Analyst',
    role: 'Analyst',
    description: 'Analyzes data, identifies trends, and provides strategic insights.',
    goal: 'Deliver actionable insights from data analysis.',
    agent_type: 'SPECIALIST',
    responsibilities: ['Analyze data', 'Identify patterns', 'Create visualizations', 'Provide recommendations'],
    tools: ['web_search'],
    color: '#06b6d4',
    icon: '📊',
  },
  {
    name: 'Reviewer',
    role: 'Reviewer',
    description: 'Reviews work output for quality, accuracy, and completeness.',
    goal: 'Ensure all deliverables meet quality standards.',
    agent_type: 'REVIEWER',
    responsibilities: ['Review output', 'Check quality', 'Provide feedback', 'Approve deliverables'],
    tools: [],
    color: '#ef4444',
    icon: '🔍',
  },
  {
    name: 'Marketing',
    role: 'Marketing Specialist',
    description: 'Creates marketing strategies, content, and campaigns.',
    goal: 'Develop effective marketing strategies and content.',
    agent_type: 'SPECIALIST',
    responsibilities: ['Create strategies', 'Write copy', 'Plan campaigns', 'Analyze performance'],
    tools: ['web_search'],
    color: '#ec4899',
    icon: '📢',
  },
];

// ── Defaults ─────────────────────────────────────────────────────

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 4096,
};

export const DEFAULT_BUDGET: BudgetConfig = {
  max_cost: 1.00,
  currency: 'USD',
};

export function createAgentFromTemplate(
  template: AgentTemplate,
  id: string,
  parentId: string | null = null,
): AgentDefinition {
  return {
    id,
    name: template.name,
    role: template.role,
    description: template.description,
    goal: template.goal,
    responsibilities: [...template.responsibilities],
    instructions: '',
    agent_type: template.agent_type,
    reports_to: parentId,
    manages: [],
    model_config: { ...DEFAULT_MODEL_CONFIG },
    tools: [...template.tools],
    permissions: [],
    knowledge_sources: [],
    budget: { ...DEFAULT_BUDGET },
    color: template.color,
    api_key: '',
    metadata: {},
  };
}

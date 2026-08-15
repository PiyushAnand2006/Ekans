/* ================================================================
   OBSIDIAN-STYLE VAULT — Ekans AI Workforce Builder
   Serializes/deserializes the entire org state into a single
   Markdown file with YAML frontmatter, [[wikilinks]], #tags,
   and structured sections — modeled after the Obsidian vault
   pattern in AI-Workforce-OS-AI-Agents-Orchestrator-.
   ================================================================ */

import type {
  AgentDefinition,
  OrganizationRelationship,
  ModelConfig,
  BudgetConfig,
  ToolPermission,
} from '@/types/domain';

// ── Vault Data Shape ─────────────────────────────────────────────

export interface VaultData {
  // Organization metadata
  orgName: string;
  orgDescription: string;
  version: number;
  created: string;
  updated: string;

  // Agents + Relationships + Positions
  agents: AgentDefinition[];
  relationships: OrganizationRelationship[];
  positions: Record<string, { x: number; y: number }>;

  // Settings snapshot (no actual API keys — just provider config status)
  settingsSnapshot: {
    defaultProvider: string;
    defaultModel: string;
    configuredProviders: string[];
  };

  // Run history summaries
  runHistory: VaultRunSummary[];
}

export interface VaultRunSummary {
  id: string;
  objective: string;
  status: string;
  agentCount: number;
  taskCount: number;
  totalCost: number;
  startedAt: string;
  completedAt: string | null;
}

// ── Serializer: App State → Markdown ─────────────────────────────

export function serializeToVault(data: VaultData): string {
  const lines: string[] = [];

  // ── YAML Frontmatter ──
  lines.push('---');
  lines.push(`title: "${escYaml(data.orgName)}"`);
  lines.push(`description: "${escYaml(data.orgDescription)}"`);
  lines.push(`version: ${data.version}`);
  lines.push(`created: "${data.created}"`);
  lines.push(`updated: "${data.updated}"`);
  lines.push(`agent_count: ${data.agents.length}`);
  lines.push(`tags: ["ekans", "ai-workforce", "organization"]`);
  lines.push(`default_provider: "${data.settingsSnapshot.defaultProvider}"`);
  lines.push(`default_model: "${data.settingsSnapshot.defaultModel}"`);
  lines.push(`configured_providers: [${data.settingsSnapshot.configuredProviders.map((p) => `"${p}"`).join(', ')}]`);
  lines.push('---');
  lines.push('');

  // ── Title ──
  lines.push(`# ${data.orgName}`);
  lines.push('');
  if (data.orgDescription) {
    lines.push(`> ${data.orgDescription}`);
    lines.push('');
  }

  // ── Agents Section ──
  lines.push('## Agents');
  lines.push('');

  for (const agent of data.agents) {
    const icon = getAgentIcon(agent.agent_type);
    lines.push(`### ${icon} ${agent.name}`);
    lines.push('');
    lines.push(`- **ID**: \`${agent.id}\``);
    lines.push(`- **Role**: ${agent.role}`);
    lines.push(`- **Type**: ${agent.agent_type} #${agent.agent_type.toLowerCase()}`);
    lines.push(`- **Description**: ${agent.description || '_No description_'}`);
    lines.push(`- **Goal**: ${agent.goal || '_No goal set_'}`);

    if (agent.reports_to) {
      const parent = data.agents.find((a) => a.id === agent.reports_to);
      if (parent) {
        lines.push(`- **Reports To**: [[${parent.name}]]`);
      }
    }

    if (agent.manages.length > 0) {
      const managedNames = agent.manages
        .map((mid) => data.agents.find((a) => a.id === mid))
        .filter(Boolean)
        .map((a) => `[[${a!.name}]]`);
      if (managedNames.length > 0) {
        lines.push(`- **Manages**: ${managedNames.join(', ')}`);
      }
    }

    if (agent.responsibilities.length > 0) {
      lines.push(`- **Responsibilities**:`);
      for (const r of agent.responsibilities) {
        lines.push(`  - ${r}`);
      }
    }

    if (agent.instructions) {
      lines.push(`- **Instructions**: ${agent.instructions}`);
    }

    // Model config
    lines.push(`- **Model**: \`${agent.model_config.provider}/${agent.model_config.model}\` (temp=${agent.model_config.temperature}, max_tokens=${agent.model_config.max_tokens})`);

    if (agent.tools.length > 0) {
      lines.push(`- **Tools**: ${agent.tools.map((t) => `\`${t}\``).join(', ')}`);
    }

    if (agent.permissions.length > 0) {
      lines.push(`- **Permissions**: ${agent.permissions.map((p) => `${p.tool_id}=${p.permission}`).join(', ')}`);
    }

    lines.push(`- **Budget**: $${agent.budget.max_cost} ${agent.budget.currency}`);
    lines.push(`- **Color**: \`${agent.color}\``);
    lines.push('');
  }

  // ── Relationships Section ──
  lines.push('## Relationships');
  lines.push('');
  if (data.relationships.length > 0) {
    lines.push('| Source | Target | Type |');
    lines.push('|--------|--------|------|');
    for (const rel of data.relationships) {
      const source = data.agents.find((a) => a.id === rel.source_id);
      const target = data.agents.find((a) => a.id === rel.target_id);
      lines.push(
        `| [[${source?.name || rel.source_id}]] | [[${target?.name || rel.target_id}]] | ${rel.type} |`
      );
    }
  } else {
    lines.push('_No relationships defined._');
  }
  lines.push('');

  // ── Positions Section ──
  lines.push('## Layout Positions');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(data.positions, null, 2));
  lines.push('```');
  lines.push('');

  // ── Agent Data (machine-readable JSON block) ──
  lines.push('## Agent Data');
  lines.push('');
  lines.push('<!-- ekans:agents:start -->');
  lines.push('```json');
  lines.push(JSON.stringify(data.agents, null, 2));
  lines.push('```');
  lines.push('<!-- ekans:agents:end -->');
  lines.push('');

  // ── Relationships Data (machine-readable) ──
  lines.push('## Relationship Data');
  lines.push('');
  lines.push('<!-- ekans:relationships:start -->');
  lines.push('```json');
  lines.push(JSON.stringify(data.relationships, null, 2));
  lines.push('```');
  lines.push('<!-- ekans:relationships:end -->');
  lines.push('');

  // ── Positions Data (machine-readable) ──
  lines.push('## Position Data');
  lines.push('');
  lines.push('<!-- ekans:positions:start -->');
  lines.push('```json');
  lines.push(JSON.stringify(data.positions, null, 2));
  lines.push('```');
  lines.push('<!-- ekans:positions:end -->');
  lines.push('');

  // ── Run History ──
  lines.push('## Run History');
  lines.push('');
  if (data.runHistory.length > 0) {
    for (const run of data.runHistory) {
      lines.push(`### Run: ${run.id}`);
      lines.push(`- **Objective**: ${run.objective}`);
      lines.push(`- **Status**: ${run.status} #${run.status.toLowerCase()}`);
      lines.push(`- **Agents**: ${run.agentCount}`);
      lines.push(`- **Tasks**: ${run.taskCount}`);
      lines.push(`- **Cost**: $${run.totalCost.toFixed(4)}`);
      lines.push(`- **Started**: ${run.startedAt}`);
      if (run.completedAt) {
        lines.push(`- **Completed**: ${run.completedAt}`);
      }
      lines.push('');
    }
  } else {
    lines.push('_No runs recorded yet._');
    lines.push('');
  }

  // ── Footer ──
  lines.push('---');
  lines.push(`_Generated by Ekans AI Workforce Builder v${data.version} at ${data.updated}_`);
  lines.push('');

  return lines.join('\n');
}

// ── Deserializer: Markdown → App State ───────────────────────────

export function deserializeFromVault(markdown: string): VaultData | null {
  try {
    // Parse frontmatter
    const frontmatter = parseFrontmatter(markdown);

    // Extract machine-readable JSON blocks
    const agents = extractJsonBlock(markdown, 'ekans:agents');
    const relationships = extractJsonBlock(markdown, 'ekans:relationships');
    const positions = extractJsonBlock(markdown, 'ekans:positions');

    if (!agents) return null;

    return {
      orgName: frontmatter.title || 'My AI Organization',
      orgDescription: frontmatter.description || '',
      version: frontmatter.version || 1,
      created: frontmatter.created || new Date().toISOString(),
      updated: frontmatter.updated || new Date().toISOString(),
      agents: agents as AgentDefinition[],
      relationships: (relationships || []) as OrganizationRelationship[],
      positions: (positions || {}) as Record<string, { x: number; y: number }>,
      settingsSnapshot: {
        defaultProvider: frontmatter.default_provider || 'openai',
        defaultModel: frontmatter.default_model || 'gpt-4o-mini',
        configuredProviders: frontmatter.configured_providers || [],
      },
      runHistory: [],
    };
  } catch (e) {
    console.error('[Vault] Failed to deserialize vault:', e);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function escYaml(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function getAgentIcon(type: string): string {
  switch (type) {
    case 'MANAGER': return '';
    case 'SPECIALIST': return '';
    case 'REVIEWER': return '';
    case 'HUMAN': return '';
    case 'CUSTOM': return '';
    default: return '';
  }
}

function parseFrontmatter(md: string): Record<string, any> {
  const fm: Record<string, any> = {};
  if (!md.startsWith('---')) return fm;

  const parts = md.split('---', 3);
  if (parts.length < 3) return fm;

  const yaml = parts[1];
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: any = line.slice(colonIdx + 1).trim();

    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    // Parse arrays
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim().replace(/^"/, '').replace(/"$/, ''))
          .filter(Boolean);
      }
    }

    // Parse numbers
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }

    if (key) fm[key] = value;
  }
  return fm;
}

function extractJsonBlock(md: string, marker: string): any | null {
  const startTag = `<!-- ${marker}:start -->`;
  const endTag = `<!-- ${marker}:end -->`;
  const startIdx = md.indexOf(startTag);
  const endIdx = md.indexOf(endTag);

  if (startIdx === -1 || endIdx === -1) return null;

  const between = md.slice(startIdx + startTag.length, endIdx);

  // Extract content within ```json ... ```
  const jsonMatch = between.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[1].trim());
  } catch {
    return null;
  }
}

// ── Vault File Utilities ─────────────────────────────────────────

export function downloadVault(data: VaultData, filename?: string): void {
  const md = serializeToVault(data);
  const safeName = data.orgName.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_');
  const fname = filename || `${safeName}_vault.md`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

export function readVaultFile(file: File): Promise<VaultData | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(deserializeFromVault(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

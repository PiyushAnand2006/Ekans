import { useOrgStore } from '@/store/org-store';
import { useUiStore } from '@/store/ui-store';
import type { AgentDefinition, AgentType } from '@/types/domain';

const TYPE_COLORS: Record<AgentType, string> = {
  MANAGER: '#4a9eff',
  SPECIALIST: '#f59e0b',
  REVIEWER: '#10b981',
  HUMAN: '#d29922',
  CUSTOM: '#8b5cf6',
};

const PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'ollama', 'openai-compatible'];
const AGENT_TYPES: AgentType[] = ['MANAGER', 'SPECIALIST', 'REVIEWER', 'HUMAN', 'CUSTOM'];
const AVAILABLE_TOOLS = ['web_search', 'http', 'filesystem', 'terminal', 'git', 'documents'];
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-4o-mini',
  ollama: 'llama3.3',
  'openai-compatible': 'gpt-4o-mini',
};

export function InspectorPanel() {
  const selectedId = useUiStore((s) => s.selectedAgentId);
  const closeInspector = useUiStore((s) => s.closeInspector);
  const agent = useOrgStore((s) => (selectedId ? s.agents.get(selectedId) : undefined)) as AgentDefinition;
  const updateAgent = useOrgStore((s) => s.updateAgent);
  const openDeleteDialog = useUiStore((s) => s.openDeleteDialog);

  if (!agent) {
    return (
      <div className="inspector-panel">
        <div className="inspector-empty">
          <div className="inspector-empty-icon">🎯</div>
          <div>Select an agent to inspect</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Click a node on the canvas, or double-click empty space to create one.
          </div>
        </div>
      </div>
    );
  }

  const color = agent.color || TYPE_COLORS[agent.agent_type] || '#4a9eff';

  const update = (updates: Partial<AgentDefinition>) => {
    updateAgent(agent.id, updates);
  };

  const updateProvider = (provider: string) => {
    const nextModel = agent.model_config.model.trim() || DEFAULT_MODELS[provider] || agent.model_config.model;
    update({ model_config: { ...agent.model_config, provider, model: nextModel } });
  };


  return (
    <div className="inspector-panel">
      {/* Header */}
      <div className="inspector-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="inspector-badge" style={{ background: color }}>
            {agent.agent_type}
          </span>
          <span className="inspector-title">{agent.name}</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={closeInspector} title="Close inspector">
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="inspector-body">
        {/* Identity */}
        <div className="inspector-section">
          <div className="inspector-section-title">🏷️ Identity</div>
          <div className="form-group">
            <label className="label">Name</label>
            <input
              className="input"
              value={agent.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Agent name"
            />
          </div>
          <div className="form-group">
            <label className="label">Role</label>
            <input
              className="input"
              value={agent.role}
              onChange={(e) => update({ role: e.target.value })}
              placeholder="e.g., Marketing Manager"
            />
          </div>
          <div className="form-group">
            <label className="label">Agent Type</label>
            <select
              className="select"
              value={agent.agent_type}
              onChange={(e) => update({ agent_type: e.target.value as AgentType })}
            >
              {AGENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={agent.color}
                onChange={(e) => update({ color: e.target.value })}
                style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.color}</span>
            </div>
          </div>
        </div>

        {/* Purpose */}
        <div className="inspector-section">
          <div className="inspector-section-title">🎯 Purpose</div>
          <div className="form-group">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              value={agent.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What does this agent do?"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="label">Goal</label>
            <textarea
              className="textarea"
              value={agent.goal}
              onChange={(e) => update({ goal: e.target.value })}
              placeholder="What is this agent trying to achieve?"
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="label">Instructions</label>
            <textarea
              className="textarea"
              value={agent.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              placeholder="Specific instructions for this agent (optional)"
              rows={3}
            />
          </div>
        </div>

        {/* Responsibilities */}
        <div className="inspector-section">
          <div className="inspector-section-title">📋 Responsibilities</div>
          <div className="list-editor">
            {agent.responsibilities.map((resp, i) => (
              <div key={i} className="list-editor-item">
                <input
                  className="input"
                  value={resp}
                  onChange={(e) => {
                    const newResp = [...agent.responsibilities];
                    newResp[i] = e.target.value;
                    update({ responsibilities: newResp });
                  }}
                />
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => {
                    const newResp = agent.responsibilities.filter((_, j) => j !== i);
                    update({ responsibilities: newResp });
                  }}
                >✕</button>
              </div>
            ))}
            <button
              className="list-editor-add"
              onClick={() => update({ responsibilities: [...agent.responsibilities, ''] })}
            >
              + Add responsibility
            </button>
          </div>
        </div>

        {/* Model Configuration */}
        <div className="inspector-section">
          <div className="inspector-section-title">🧠 Model</div>
          <div className="form-group">
            <label className="label">Provider</label>
            <select
              className="select"
              value={agent.model_config.provider}
              onChange={(e) => updateProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Model</label>
            <input
              className="input"
              value={agent.model_config.model}
              onChange={(e) => update({ model_config: { ...agent.model_config, model: e.target.value } })}
              placeholder="e.g., gpt-4o-mini"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label">Temperature</label>
              <input
                className="input"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={agent.model_config.temperature}
                onChange={(e) => update({ model_config: { ...agent.model_config, temperature: parseFloat(e.target.value) || 0 } })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label">Max Tokens</label>
              <input
                className="input"
                type="number"
                min={100}
                step={100}
                value={agent.model_config.max_tokens}
                onChange={(e) => update({ model_config: { ...agent.model_config, max_tokens: parseInt(e.target.value) || 4096 } })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="label">API Key</label>
            <input
              className="input"
              type="password"
              value={agent.api_key}
              onChange={(e) => update({ api_key: e.target.value })}
              placeholder="Agent-specific API key"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Tools */}
        <div className="inspector-section">
          <div className="inspector-section-title">🔧 Tools</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {AVAILABLE_TOOLS.map((tool) => {
              const isEnabled = agent.tools.includes(tool);
              return (
                <button
                  key={tool}
                  className={`chip${isEnabled ? '' : ''}`}
                  style={{
                    cursor: 'pointer',
                    background: isEnabled ? 'rgba(74,158,255,0.15)' : 'var(--bg-elevated)',
                    borderColor: isEnabled ? 'var(--accent-blue)' : 'var(--border-subtle)',
                    color: isEnabled ? 'var(--accent-blue)' : 'var(--text-muted)',
                    fontWeight: isEnabled ? 600 : 400,
                  }}
                  onClick={() => {
                    if (isEnabled) {
                      update({ tools: agent.tools.filter((t) => t !== tool) });
                    } else {
                      update({ tools: [...agent.tools, tool] });
                    }
                  }}
                >
                  {isEnabled ? '✓ ' : ''}{tool}
                </button>
              );
            })}
          </div>
        </div>

        {/* Budget */}
        <div className="inspector-section">
          <div className="inspector-section-title">💰 Budget</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label">Max Cost</label>
              <input
                className="input"
                type="number"
                min={0}
                step={0.1}
                value={agent.budget.max_cost}
                onChange={(e) => update({ budget: { ...agent.budget, max_cost: parseFloat(e.target.value) || 0 } })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="label">Currency</label>
              <input
                className="input"
                value={agent.budget.currency}
                onChange={(e) => update({ budget: { ...agent.budget, currency: e.target.value } })}
              />
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="inspector-section">
          <button
            className="btn btn-danger"
            style={{ width: '100%' }}
            onClick={() => openDeleteDialog(agent.id)}
          >
            🗑️ Delete Agent
          </button>
        </div>
      </div>
    </div>
  );
}

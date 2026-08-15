import { useState } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { AGENT_TEMPLATES, type AgentTemplate, type AgentType } from '@/types/domain';
import { toast } from '@/components/common/Toast';

export function CreateAgentDialog() {
  const isOpen = useUiStore((s) => s.createDialogOpen);
  const parentId = useUiStore((s) => s.createDialogParentId);
  const closeDialog = useUiStore((s) => s.closeCreateDialog);
  const addAgent = useOrgStore((s) => s.addAgent);
  const agents = useOrgStore((s) => s.agents);

  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customType, setCustomType] = useState<AgentType>('SPECIALIST');

  if (!isOpen) return null;

  const parentAgent = parentId ? agents.get(parentId) : null;

  const handleCreate = () => {
    if (selectedTemplate) {
      const id = addAgent(selectedTemplate, parentId ?? null);
      toast(`Created ${selectedTemplate.name}`, 'success');
    } else if (customName.trim()) {
      const template: AgentTemplate = {
        name: customName.trim(),
        role: customRole.trim() || customName.trim(),
        description: '',
        goal: '',
        agent_type: customType,
        responsibilities: [],
        tools: [],
        color: customType === 'MANAGER' ? '#4a9eff' : customType === 'REVIEWER' ? '#10b981' : '#f59e0b',
        icon: '',
      };
      addAgent(template, parentId ?? null);
      toast(`Created ${customName.trim()}`, 'success');
    }
    handleClose();
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setCustomName('');
    setCustomRole('');
    setCustomType('SPECIALIST');
    closeDialog();
  };

  const canCreate = selectedTemplate !== null || customName.trim().length > 0;

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-title">
            {parentAgent ? `Add subordinate to ${parentAgent.name}` : 'Add Agent'}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={handleClose}>x</button>
        </div>

        <div className="dialog-body">
          {/* Template selection */}
          <div className="form-group">
            <label className="label">Choose a Template</label>
            <div className="templates-grid">
              {AGENT_TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.name}
                  className={`template-card${selectedTemplate?.name === tmpl.name ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedTemplate(
                      selectedTemplate?.name === tmpl.name ? null : tmpl,
                    );
                    setCustomName('');
                  }}
                >
                  <div className="template-icon">{tmpl.icon}</div>
                  <div className="template-name">{tmpl.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or create custom</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          {/* Custom agent */}
          <div className="form-group">
            <label className="label">Custom Agent Name</label>
            <input
              className="input"
              value={customName}
              onChange={(e) => { setCustomName(e.target.value); setSelectedTemplate(null); }}
              placeholder="e.g., Healthcare Research Specialist"
            />
          </div>
          {customName.trim() && (
            <>
              <div className="form-group">
                <label className="label">Role Title</label>
                <input
                  className="input"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="e.g., Research Specialist"
                />
              </div>
              <div className="form-group">
                <label className="label">Agent Type</label>
                <select
                  className="select"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value as AgentType)}
                >
                  <option value="MANAGER">Manager</option>
                  <option value="SPECIALIST">Specialist</option>
                  <option value="REVIEWER">Reviewer</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn" onClick={handleClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate}>
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}

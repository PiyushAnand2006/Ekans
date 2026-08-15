import { useState } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { AGENT_TEMPLATES, type AgentTemplate, type AgentType } from '@/types/domain';
import { toast } from '@/components/common/Toast';

// ── Poster Graphics for Agent Templates ────────────────────────────

function TemplatePosterGraphic({ name, color }: { name: string; color: string }) {
  switch (name) {
    case 'Manager':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="mgr-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#1e3a8a" stopOpacity="0.8" />
              <stop offset="1" stopColor="#0284c7" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="mgr-glow" cx="80" cy="45" r="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" stopOpacity="0.4" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#mgr-grad)" />
          <circle cx="80" cy="45" r="35" fill="url(#mgr-glow)" />
          {/* Grid lines */}
          <line x1="20" y1="45" x2="140" y2="45" stroke="#38bdf8" strokeOpacity="0.15" strokeDasharray="3 3" />
          <line x1="80" y1="15" x2="80" y2="75" stroke="#38bdf8" strokeOpacity="0.15" strokeDasharray="3 3" />
          {/* Connecting Hierarchy Links */}
          <path d="M80 28 L50 62 M80 28 L110 62 M80 28 L80 62" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.6" />
          {/* Top Apex Node */}
          <rect x="70" y="20" width="20" height="16" rx="4" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
          <circle cx="80" cy="28" r="3" fill="#38bdf8" />
          {/* Subordinate Nodes */}
          <rect x="42" y="56" width="16" height="14" rx="3" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5" />
          <rect x="72" y="56" width="16" height="14" rx="3" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5" />
          <rect x="102" y="56" width="16" height="14" rx="3" fill="#1e293b" stroke="#60a5fa" strokeWidth="1.5" />
        </svg>
      );

    case 'Researcher':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="res-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#312e81" stopOpacity="0.8" />
              <stop offset="1" stopColor="#7c3aed" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="res-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#a855f7" stopOpacity="0.4" />
              <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#res-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#res-glow)" />
          {/* Orbital rings */}
          <ellipse cx="80" cy="45" rx="36" ry="14" stroke="#c084fc" strokeWidth="1.2" strokeOpacity="0.5" transform="rotate(-25 80 45)" />
          <ellipse cx="80" cy="45" rx="36" ry="14" stroke="#c084fc" strokeWidth="1.2" strokeOpacity="0.5" transform="rotate(35 80 45)" />
          {/* Central Nucleus & Nodes */}
          <circle cx="80" cy="45" r="9" fill="#1e1b4b" stroke="#a855f7" strokeWidth="2" />
          <circle cx="80" cy="45" r="4" fill="#c084fc" />
          <circle cx="56" cy="36" r="3.5" fill="#e879f9" />
          <circle cx="106" cy="54" r="3.5" fill="#e879f9" />
        </svg>
      );

    case 'Writer':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wrt-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#78350f" stopOpacity="0.8" />
              <stop offset="1" stopColor="#d97706" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="wrt-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fbbf24" stopOpacity="0.35" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#wrt-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#wrt-glow)" />
          {/* Document Sheet */}
          <rect x="58" y="20" width="44" height="50" rx="4" fill="#1c1917" stroke="#f59e0b" strokeWidth="1.8" />
          {/* Document Text Lines */}
          <line x1="66" y1="30" x2="90" y2="30" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
          <line x1="66" y1="38" x2="94" y2="38" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
          <line x1="66" y1="45" x2="86" y2="45" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
          <line x1="66" y1="52" x2="92" y2="52" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
          <line x1="66" y1="59" x2="78" y2="59" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
          {/* Pen / Quill accent */}
          <path d="M96 22 L108 14 L112 18 L100 26 Z" fill="#fbbf24" />
        </svg>
      );

    case 'Developer':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dev-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#064e3b" stopOpacity="0.8" />
              <stop offset="1" stopColor="#059669" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="dev-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34d399" stopOpacity="0.4" />
              <stop offset="1" stopColor="#34d399" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#dev-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#dev-glow)" />
          {/* Terminal Box */}
          <rect x="46" y="22" width="68" height="46" rx="6" fill="#022c22" stroke="#10b981" strokeWidth="1.8" />
          {/* Terminal Header Dots */}
          <circle cx="54" cy="29" r="1.5" fill="#f87171" />
          <circle cx="60" cy="29" r="1.5" fill="#fbbf24" />
          <circle cx="66" cy="29" r="1.5" fill="#34d399" />
          {/* Code Glyphs < / > */}
          <path d="M64 42 L56 48 L64 54" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M78 40 L72 56" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
          <path d="M86 42 L94 48 L86 54" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'Analyst':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ana-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#164e63" stopOpacity="0.8" />
              <stop offset="1" stopColor="#0891b2" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="ana-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee" stopOpacity="0.35" />
              <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#ana-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#ana-glow)" />
          {/* Chart Grid */}
          <line x1="45" y1="65" x2="115" y2="65" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="45" y1="25" x2="45" y2="65" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.5" />
          {/* Histogram Bars */}
          <rect x="52" y="48" width="8" height="17" rx="1.5" fill="#0891b2" stroke="#22d3ee" strokeWidth="1" />
          <rect x="65" y="38" width="8" height="27" rx="1.5" fill="#0891b2" stroke="#22d3ee" strokeWidth="1" />
          <rect x="78" y="30" width="8" height="35" rx="1.5" fill="#06b6d4" stroke="#67e8f9" strokeWidth="1" />
          <rect x="91" y="42" width="8" height="23" rx="1.5" fill="#0891b2" stroke="#22d3ee" strokeWidth="1" />
          <rect x="104" y="24" width="8" height="41" rx="1.5" fill="#06b6d4" stroke="#67e8f9" strokeWidth="1" />
          {/* Trend Line */}
          <path d="M56 46 L69 36 L82 28 L95 40 L108 22" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="108" cy="22" r="3" fill="#67e8f9" />
        </svg>
      );

    case 'Reviewer':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rev-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#881337" stopOpacity="0.8" />
              <stop offset="1" stopColor="#e11d48" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="rev-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f43f5e" stopOpacity="0.35" />
              <stop offset="1" stopColor="#f43f5e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#rev-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#rev-glow)" />
          {/* Security Shield */}
          <path
            d="M80 20 L104 28 C104 50 92 64 80 70 C68 64 56 50 56 28 Z"
            fill="#1e1b2e"
            stroke="#ef4444"
            strokeWidth="2"
          />
          {/* Verification Checkmark */}
          <path
            d="M71 44 L77 50 L89 36"
            stroke="#f43f5e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'Marketing':
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="mkt-grad" x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0f172a" />
              <stop offset="0.5" stopColor="#701a75" stopOpacity="0.8" />
              <stop offset="1" stopColor="#c026d3" stopOpacity="0.4" />
            </linearGradient>
            <radialGradient id="mkt-glow" cx="80" cy="45" r="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f472b6" stopOpacity="0.35" />
              <stop offset="1" stopColor="#f472b6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="160" height="90" rx="8" fill="url(#mkt-grad)" />
          <circle cx="80" cy="45" r="32" fill="url(#mkt-glow)" />
          {/* Broadcast Waves */}
          <path d="M80 56 L70 42 L60 44 L58 48 L56 46 L58 40 L70 38 L84 32 L84 62 Z" fill="#db2777" stroke="#f472b6" strokeWidth="1.5" />
          <path d="M92 38 C96 42 96 50 92 54" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
          <path d="M99 33 C105 40 105 57 99 64" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
          <path d="M106 28 C114 38 114 64 106 74" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 160 90" className="template-poster-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="160" height="90" rx="8" fill="#1e293b" />
          <circle cx="80" cy="45" r="16" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="2" />
        </svg>
      );
  }
}

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
      <div className="dialog create-agent-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-title">
            {parentAgent ? `Add Subordinate to ${parentAgent.name}` : 'Add Agent'}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={handleClose}>x</button>
        </div>

        <div className="dialog-body">
          {/* Template selection */}
          <div className="form-group">
            <label className="label">Choose an Agent Role Poster</label>
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
                  <div className="template-poster-wrapper">
                    <TemplatePosterGraphic name={tmpl.name} color={tmpl.color} />
                    <span className="template-poster-type" style={{ borderColor: tmpl.color, color: tmpl.color }}>
                      {tmpl.agent_type}
                    </span>
                  </div>
                  <div className="template-info">
                    <div className="template-name">{tmpl.name}</div>
                    <div className="template-desc">{tmpl.description}</div>
                  </div>
                  {selectedTemplate?.name === tmpl.name && (
                    <div className="template-selected-badge" style={{ background: tmpl.color }}>
                      SELECTED
                    </div>
                  )}
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

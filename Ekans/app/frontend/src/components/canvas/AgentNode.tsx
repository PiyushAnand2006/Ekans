import React, { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentDefinition, AgentType, AgentStatus } from '@/types/domain';
import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';

/* ── Color mapping by agent type ───────────────────────────────── */
const TYPE_COLORS: Record<AgentType, string> = {
  MANAGER: '#4a9eff',
  SPECIALIST: '#f59e0b',
  REVIEWER: '#10b981',
  HUMAN: '#d29922',
  CUSTOM: '#8b5cf6',
};

const TYPE_ICONS: Record<AgentType, string> = {
  MANAGER: '👔',
  SPECIALIST: '⚡',
  REVIEWER: '🔍',
  HUMAN: '👤',
  CUSTOM: '🔧',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  IDLE: 'Idle',
  PLANNING: 'Planning…',
  WORKING: 'Working…',
  WAITING: 'Waiting…',
  REVIEWING: 'Reviewing…',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function AgentNodeInner({ data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const agent = data.agent as AgentDefinition;
  const color = agent.color || TYPE_COLORS[agent.agent_type] || '#4a9eff';
  const icon = TYPE_ICONS[agent.agent_type] || '🤖';
  const status = useOrgStore((s) => s.agentStatuses.get(agent.id)) as AgentStatus | undefined;
  const childCount = useOrgStore((s) => {
    let count = 0;
    for (const [, a] of s.agents) {
      if (a.reports_to === agent.id) count++;
    }
    return count;
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    useUiStore.getState().openContextMenu(e.clientX, e.clientY, agent.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { inspectorOpen, openInspector, selectAgent } = useUiStore.getState();
    selectAgent(agent.id);
    if (!inspectorOpen) openInspector();
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    useUiStore.getState().openCreateDialog(agent.id);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    useUiStore.getState().openDeleteDialog(agent.id);
  };

  const statusColor = status ? `var(--status-${status.toLowerCase()})` : undefined;

  return (
    <div
      className={`agent-node${selected ? ' selected' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Top} style={hovered ? handleHoverStyle : handleBaseStyle} />

      {/* Header */}
      <div className="agent-node-header">
        <span className="agent-node-icon">{icon}</span>
        <div className="agent-node-info">
          <div className="agent-node-name">{agent.name}</div>
          <div className="agent-node-role">{agent.role}</div>
        </div>
        <span
          className="agent-node-type-badge"
          style={{ background: color }}
        >
          {agent.agent_type}
        </span>
      </div>

      {/* Body */}
      <div className="agent-node-body">
        {agent.description && (
          <div className="agent-node-description">{agent.description}</div>
        )}
        {!agent.description && (
          <div className="agent-node-description" style={{ opacity: 0.4 }}>No description</div>
        )}

        {/* Tool chips */}
        {agent.tools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
            {agent.tools.slice(0, 3).map((t) => (
              <span key={t} className="chip" style={{ fontSize: 9, padding: '1px 6px' }}>{t}</span>
            ))}
            {agent.tools.length > 3 && (
              <span className="chip" style={{ fontSize: 9, padding: '1px 6px' }}>+{agent.tools.length - 3}</span>
            )}
          </div>
        )}

        {/* Child count */}
        {childCount > 0 && (
          <div style={{ fontSize: 11, color: color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>▾</span>
            {childCount} {childCount === 1 ? 'report' : 'reports'}
          </div>
        )}
      </div>

      {/* Status bar (visible during runs) */}
      {status && status !== 'IDLE' && (
        <div className="agent-node-status" style={{ color: statusColor }}>
          <span
            className={`agent-node-status-dot${status === 'WORKING' || status === 'PLANNING' ? ' working' : ''}`}
            style={{ background: statusColor }}
          />
          {STATUS_LABELS[status]}
        </div>
      )}

      {/* Hover actions */}
      {hovered && (
        <>
          {/* Delete button */}
          <button
            onClick={handleRemove}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 6, left: -10,
              width: 18, height: 18, borderRadius: '50%',
              border: 'none', background: 'rgba(120,120,120,0.6)',
              color: '#ddd', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s', zIndex: 10,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.8)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(120,120,120,0.6)'; e.currentTarget.style.color = '#ddd'; }}
            title="Delete agent"
          >
            ✕
          </button>

          {/* Add child button */}
          <button
            onClick={handleAddChild}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 8, right: 8,
              width: 22, height: 22, borderRadius: '50%',
              border: '1px solid var(--accent-blue)', background: 'rgba(74,158,255,0.15)',
              color: 'var(--accent-blue)', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Add subordinate"
          >
            +
          </button>
        </>
      )}

      <Handle type="source" position={Position.Bottom} style={hovered ? handleHoverStyle : handleBaseStyle} />
    </div>
  );
}

const handleBaseStyle: React.CSSProperties = {
  width: 8, height: 8,
  background: 'var(--accent-blue)',
  border: '2px solid var(--bg-surface)',
  transition: 'width 0.15s ease, height 0.15s ease',
};

const handleHoverStyle: React.CSSProperties = {
  ...handleBaseStyle,
  width: 12, height: 12,
};

export const AgentNode = memo(AgentNodeInner);

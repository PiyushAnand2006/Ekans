import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { layoutAgents } from '@/components/canvas/layout';

const buttonStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s ease' };

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button style={buttonStyle} onClick={onClick} onMouseEnter={(event) => { event.currentTarget.style.background = 'rgba(74,158,255,0.08)'; event.currentTarget.style.borderColor = 'var(--border-color)'; event.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.borderColor = 'transparent'; event.currentTarget.style.color = 'var(--text-secondary)'; }}>{label}</button>;
}

export function Toolbar() {
  const openCreateDialog = useUiStore((s) => s.openCreateDialog);
  const agents = useOrgStore((s) => s.agents);
  const setPositions = useOrgStore((s) => s.setPositions);
  const handleAutoLayout = () => {
    const { flowNodes } = layoutAgents(agents, new Map());
    const next: Record<string, { x: number; y: number }> = {};
    for (const node of flowNodes) next[node.id] = node.position;
    setPositions(next);
  };
  return <header className="toolbar toolbar-atm"><div className="toolbar-brand-atm"><span>EKANS</span><span className="toolbar-subtitle">AI Workforce Builder</span></div><div className="toolbar-center"><ToolbarButton label="+" onClick={() => openCreateDialog(null)} /><ToolbarButton label="Auto layout" onClick={handleAutoLayout} /></div><div className="toolbar-actions"><ToolbarButton label="Catalog" onClick={() => {}} /><ToolbarButton label="Schedules" onClick={() => {}} /><ToolbarButton label="Settings" onClick={() => {}} /><span className="toolbar-count">{agents.size} agents</span></div></header>;
}

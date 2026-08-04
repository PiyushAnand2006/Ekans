import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { layoutAgents } from '@/components/canvas/layout';

export function Toolbar() {
  const openCreateDialog = useUiStore((s) => s.openCreateDialog);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const agents = useOrgStore((s) => s.agents);
  const positions = useOrgStore((s) => s.positions);
  const setPositions = useOrgStore((s) => s.setPositions);
  const toSerializable = useOrgStore((s) => s.toSerializable);
  const fromSerializable = useOrgStore((s) => s.fromSerializable);
  const clearAll = useOrgStore((s) => s.clearAll);

  const handleAutoLayout = () => {
    const { flowNodes } = layoutAgents(agents, new Map());
    const newPositions: Record<string, { x: number; y: number }> = {};
    for (const n of flowNodes) {
      newPositions[n.id] = n.position;
    }
    setPositions(newPositions);
  };

  const handleExport = () => {
    const data = toSerializable();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.orgName.replace(/\s+/g, '_')}.ekans.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          fromSerializable(data);
        } catch {
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="toolbar-brand-icon">🐍</span>
        <span className="toolbar-brand-gradient">Ekans</span>
      </div>

      <div className="toolbar-separator" />

      <button className="btn btn-primary" onClick={() => openCreateDialog(null)}>
        + Add Agent
      </button>

      <button className="btn" onClick={handleAutoLayout} title="Auto-layout the org chart">
        📐 Layout
      </button>

      <div className="toolbar-separator" />

      <button className="btn" onClick={handleExport} title="Export organization">
        📤 Export
      </button>
      <button className="btn" onClick={handleImport} title="Import organization">
        📥 Import
      </button>

      <div className="toolbar-separator" />

      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Clear all agents?')) clearAll(); }}>
        🗑️ Clear
      </button>

      <div className="toolbar-spacer" />

      {/* Agent count */}
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {agents.size} agent{agents.size !== 1 ? 's' : ''}
      </span>

      <div className="toolbar-separator" />

      <button
        className={`btn btn-ghost btn-icon${inspectorOpen ? ' active' : ''}`}
        onClick={toggleInspector}
        title="Toggle inspector"
        style={inspectorOpen ? { color: 'var(--accent-blue)' } : {}}
      >
        ⚙️
      </button>
    </div>
  );
}

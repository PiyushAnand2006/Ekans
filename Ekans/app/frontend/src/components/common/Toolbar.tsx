import { useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLibraryStore } from '@/store/library-store';
import { useVaultStore } from '@/memory/vault-store';
import { layoutAgents } from '@/components/canvas/layout';

const buttonStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s ease' };

function ToolbarButton({ label, onClick, title, className, style }: { label: string; onClick: () => void; title?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      style={{ ...buttonStyle, ...style }}
      onClick={onClick}
      title={title}
      className={className}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'rgba(74,158,255,0.08)';
        event.currentTarget.style.borderColor = 'var(--border-color)';
        event.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = style?.background ? String(style.background) : 'transparent';
        event.currentTarget.style.borderColor = style?.border ? String(style.border) : 'transparent';
        event.currentTarget.style.color = style?.color ? String(style.color) : 'var(--text-secondary)';
      }}
    >
      {label}
    </button>
  );
}

export function Toolbar() {
  const openCreateDialog = useUiStore((s) => s.openCreateDialog);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const openSaveTeamDialog = useUiStore((s) => s.openSaveTeamDialog);
  const activeTeamName = useLibraryStore((s) => s.activeTeamName);
  const agents = useOrgStore((s) => s.agents);
  const setPositions = useOrgStore((s) => s.setPositions);
  const hasAnyKey = useSettingsStore((s) => s.hasAnyKey);
  const exportFile = useVaultStore((s) => s.exportFile);
  const importFile = useVaultStore((s) => s.importFile);
  const lastSaved = useVaultStore((s) => s.lastSaved);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAutoLayout = () => {
    const { flowNodes } = layoutAgents(agents, new Map());
    const next: Record<string, { x: number; y: number }> = {};
    for (const node of flowNodes) next[node.id] = node.position;
    setPositions(next);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const success = await importFile(file);
    if (success) {
      // Auto-layout after import
      handleAutoLayout();
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const keysConfigured = hasAnyKey();

  return (
    <header className="toolbar toolbar-atm">
      <div className="toolbar-brand-atm">
        <span>EKANS</span>
        <span className="toolbar-subtitle">AI Workforce Builder</span>
      </div>
      <div className="toolbar-center">
        <ToolbarButton label="+ Agent" onClick={() => openCreateDialog(null)} title="Add a new agent" />
        <ToolbarButton label="Layout" onClick={handleAutoLayout} title="Auto-arrange nodes" />
        <div className="toolbar-separator" />
        <ToolbarButton
          label="Library"
          onClick={toggleLibrary}
          title="Open Team Library to browse and import saved teams"
        />
        <div className="toolbar-separator" />
        <ToolbarButton label="Export" onClick={() => exportFile()} title="Export organization as Obsidian vault (.md)" />
        <ToolbarButton label="Import" onClick={() => fileInputRef.current?.click()} title="Import organization from vault (.md)" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </div>
      <div className="toolbar-actions">
        {activeTeamName && (
          <span
            className="toolbar-active-team-badge"
            title={`Active saved team: ${activeTeamName}`}
            onClick={toggleLibrary}
          >
            Team: {activeTeamName}
          </span>
        )}
        <button
          className="toolbar-settings-btn"
          onClick={toggleSettings}
          title={keysConfigured ? 'Settings — API keys configured' : 'Settings — No API keys configured'}
        >
          <span className={`toolbar-key-indicator ${keysConfigured ? 'configured' : 'not-configured'}`} />
          <span>Settings</span>
        </button>
        {lastSaved && (
          <span className="toolbar-saved-indicator" title={`Last saved: ${lastSaved}`}>
            Saved
          </span>
        )}
        <span className="toolbar-count">{agents.size} agents</span>
      </div>
    </header>
  );
}


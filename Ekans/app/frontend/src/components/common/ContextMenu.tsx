import { useEffect, useRef } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';

export function ContextMenu() {
  const contextMenu = useUiStore((s) => s.contextMenu);
  const closeContextMenu = useUiStore((s) => s.closeContextMenu);
  const openCreateDialog = useUiStore((s) => s.openCreateDialog);
  const openDeleteDialog = useUiStore((s) => s.openDeleteDialog);
  const selectAgent = useUiStore((s) => s.selectAgent);
  const openInspector = useUiStore((s) => s.openInspector);
  const agents = useOrgStore((s) => s.agents);

  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        closeContextMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, closeContextMenu]);

  // Close on escape
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const agent = agents.get(contextMenu.agentId);
  if (!agent) return null;

  const items = [
    {
      label: 'Inspect',
      action: () => { selectAgent(agent.id); openInspector(); closeContextMenu(); },
    },
    {
      label: 'Add Subordinate',
      action: () => { openCreateDialog(agent.id); closeContextMenu(); },
    },
    { separator: true },
    {
      label: 'Delete',
      action: () => { openDeleteDialog(agent.id); closeContextMenu(); },
      danger: true,
    },
  ];

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {agent.name}
      </div>
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return <div key={i} className="context-menu-separator" />;
        }
        return (
          <button
            key={i}
            className="context-menu-item"
            onClick={item.action}
            style={(item as any).danger ? { color: 'var(--accent-red)' } : {}}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

import { useUiStore } from '@/store/ui-store';
import { useOrgStore } from '@/store/org-store';
import { toast } from '@/components/common/Toast';

export function DeleteConfirmDialog() {
  const agentId = useUiStore((s) => s.deleteDialogAgentId);
  const closeDialog = useUiStore((s) => s.closeDeleteDialog);
  const removeAgent = useOrgStore((s) => s.removeAgent);
  const agents = useOrgStore((s) => s.agents);
  const selectAgent = useUiStore((s) => s.selectAgent);

  if (!agentId) return null;

  const agent = agents.get(agentId);
  if (!agent) return null;

  // Count descendants
  let descendantCount = 0;
  const countDescendants = (id: string) => {
    for (const [, a] of agents) {
      if (a.reports_to === id) {
        descendantCount++;
        countDescendants(a.id);
      }
    }
  };
  countDescendants(agentId);

  const handleDelete = () => {
    const name = agent.name;
    selectAgent(null);
    removeAgent(agentId);
    toast(`Deleted ${name}${descendantCount > 0 ? ` and ${descendantCount} subordinate${descendantCount > 1 ? 's' : ''}` : ''}`, 'info');
    closeDialog();
  };

  return (
    <div className="dialog-overlay" onClick={closeDialog}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="dialog-header">
          <div className="dialog-title">Delete Agent</div>
          <button className="btn btn-ghost btn-icon" onClick={closeDialog}>✕</button>
        </div>
        <div className="dialog-body">
          <p style={{ marginBottom: 12 }}>
            Are you sure you want to delete <strong>{agent.name}</strong>?
          </p>
          {descendantCount > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 13, color: 'var(--accent-red)',
            }}>
              ⚠️ This will also delete {descendantCount} subordinate agent{descendantCount > 1 ? 's' : ''}.
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn" onClick={closeDialog}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} style={{
            background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)',
          }}>
            🗑️ Delete{descendantCount > 0 ? ` (${descendantCount + 1})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

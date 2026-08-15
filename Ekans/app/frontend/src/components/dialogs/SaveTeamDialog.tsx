/* ================================================================
   SAVE TEAM DIALOG — Save current workspace to Team Library
   Handles both saving as a new team and updating an existing team.
   ================================================================ */

import { useEffect, useState } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useLibraryStore } from '@/store/library-store';
import { useOrgStore } from '@/store/org-store';
import { toast } from '@/components/common/Toast';

export function SaveTeamDialog() {
  const isOpen = useUiStore((s) => s.saveTeamDialogOpen);
  const closeDialog = useUiStore((s) => s.closeSaveTeamDialog);
  const activeTeam = useLibraryStore((s) => s.getActiveTeam());
  const saveCurrentTeamAsNew = useLibraryStore((s) => s.saveCurrentTeamAsNew);
  const updateSavedTeam = useLibraryStore((s) => s.updateSavedTeam);
  const agents = useOrgStore((s) => s.agents);
  const orgName = useOrgStore((s) => s.orgName);

  const [mode, setMode] = useState<'update' | 'new'>('update');
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (activeTeam) {
        setMode('update');
        setTeamName(`${activeTeam.name} (Copy)`);
        setDescription(activeTeam.description || '');
      } else {
        setMode('new');
        setTeamName(orgName && orgName !== 'My AI Organization' ? orgName : '');
        setDescription('');
      }
    }
  }, [isOpen, activeTeam, orgName]);

  if (!isOpen) return null;

  const handleSaveAsNew = () => {
    const finalName = teamName.trim() || (activeTeam ? `${activeTeam.name} (Copy)` : 'Untitled Team');
    saveCurrentTeamAsNew(finalName, description);
    toast(`Saved as new team "${finalName}"`, 'success');
    closeDialog();
  };

  const handleUpdateExisting = () => {
    if (!activeTeam) return;
    updateSavedTeam(activeTeam.id);
    toast(`Updated team "${activeTeam.name}"`, 'success');
    closeDialog();
  };

  return (
    <div className="dialog-overlay" onClick={closeDialog}>
      <div
        className="dialog save-team-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, maxWidth: '92vw' }}
      >
        <div className="dialog-header">
          <div className="dialog-title">Save Team</div>
          <button className="btn btn-ghost btn-icon" onClick={closeDialog} title="Close">
            x
          </button>
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeTeam ? (
            <>
              <div className="save-team-active-banner">
                <div className="save-team-active-label">Currently Working On</div>
                <div className="save-team-active-name">{activeTeam.name}</div>
                <div className="save-team-active-meta">
                  Workspace has {agents.size} agent{agents.size !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="save-team-options">
                <label
                  className={`save-team-option-card ${mode === 'update' ? 'selected' : ''}`}
                  onClick={() => setMode('update')}
                >
                  <input
                    type="radio"
                    name="saveMode"
                    checked={mode === 'update'}
                    onChange={() => setMode('update')}
                    style={{ marginTop: 2 }}
                  />
                  <div className="save-team-option-content">
                    <div className="save-team-option-title">Update "{activeTeam.name}"</div>
                    <div className="save-team-option-desc">
                      Overwrite the saved team in your library with your latest workspace changes.
                    </div>
                  </div>
                </label>

                <label
                  className={`save-team-option-card ${mode === 'new' ? 'selected' : ''}`}
                  onClick={() => setMode('new')}
                >
                  <input
                    type="radio"
                    name="saveMode"
                    checked={mode === 'new'}
                    onChange={() => setMode('new')}
                    style={{ marginTop: 2 }}
                  />
                  <div className="save-team-option-content">
                    <div className="save-team-option-title">Save as a New Team</div>
                    <div className="save-team-option-desc">
                      Keep "{activeTeam.name}" intact and create a brand new team in your library.
                    </div>
                  </div>
                </label>
              </div>

              {mode === 'new' && (
                <div className="save-team-fields" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-secondary)' }}>
                      New Team Name
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. Sales & Support Alpha"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsNew(); }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-secondary)' }}>
                      Description (optional)
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. Optimized for cold outreach"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsNew(); }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="save-team-fields" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Save your current workforce ({agents.size} agent{agents.size !== 1 ? 's' : ''}) to your Team Library so you can recall it anytime.
              </p>
              <div>
                <label className="form-label" style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-secondary)' }}>
                  Team Name
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Executive Core Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsNew(); }}
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-secondary)' }}>
                  Description (optional)
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Leadership & department managers"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsNew(); }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn" onClick={closeDialog}>
            Cancel
          </button>
          {activeTeam && mode === 'update' ? (
            <button className="btn btn-primary" onClick={handleUpdateExisting}>
              Update Saved Team
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSaveAsNew}
              disabled={!teamName.trim() && !activeTeam}
            >
              Save Team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

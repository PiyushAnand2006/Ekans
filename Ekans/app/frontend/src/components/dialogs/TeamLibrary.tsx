/* ================================================================
   TEAM LIBRARY — Full-page overlay to save, browse, and load teams
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useLibraryStore, type SavedTeam } from '@/store/library-store';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TeamCard({ team, onLoad, onDelete, onRename }: {
  team: SavedTeam;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== team.name) {
      onRename(team.id, trimmed);
    } else {
      setEditName(team.name);
    }
    setEditing(false);
  };

  return (
    <div className="team-card">
      <div className="team-card-header">
        {editing ? (
          <input
            ref={inputRef}
            className="team-card-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setEditName(team.name); setEditing(false); }
            }}
          />
        ) : (
          <h3
            className="team-card-name"
            onDoubleClick={() => { setEditing(true); setEditName(team.name); }}
            title="Double-click to rename"
          >
            {team.name}
          </h3>
        )}
        <span className="team-card-date">{formatDate(team.savedAt)}</span>
      </div>

      {team.description && (
        <p className="team-card-description">{team.description}</p>
      )}

      <div className="team-card-meta">
        <span className="team-card-agents">{team.agentCount} agent{team.agentCount !== 1 ? 's' : ''}</span>
        {team.orgName && team.orgName !== 'My AI Organization' && (
          <span className="team-card-org">{team.orgName}</span>
        )}
      </div>

      <div className="team-card-actions">
        <button className="team-card-btn team-card-btn-load" onClick={() => onLoad(team.id)}>
          Load
        </button>
        {confirmDelete ? (
          <div className="team-card-confirm">
            <span className="team-card-confirm-text">Delete?</span>
            <button className="team-card-btn team-card-btn-danger" onClick={() => { onDelete(team.id); setConfirmDelete(false); }}>
              Yes
            </button>
            <button className="team-card-btn team-card-btn-cancel" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </div>
        ) : (
          <button className="team-card-btn team-card-btn-delete" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function TeamLibrary() {
  const libraryOpen = useUiStore((s) => s.libraryOpen);
  const toggleLibrary = useUiStore((s) => s.toggleLibrary);
  const teams = useLibraryStore((s) => s.teams);
  const loadFromStorage = useLibraryStore((s) => s.loadFromStorage);
  const saveCurrentTeam = useLibraryStore((s) => s.saveCurrentTeam);
  const loadTeam = useLibraryStore((s) => s.loadTeam);
  const deleteTeam = useLibraryStore((s) => s.deleteTeam);
  const renameTeam = useLibraryStore((s) => s.renameTeam);

  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load teams from storage when overlay opens
  useEffect(() => {
    if (libraryOpen) {
      loadFromStorage();
      setSaveName('');
      setSaveDescription('');
      setSaveSuccess(false);
      setConfirmLoadId(null);
    }
  }, [libraryOpen, loadFromStorage]);

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    saveCurrentTeam(saveName, saveDescription);
    setSaveName('');
    setSaveDescription('');
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [saveName, saveDescription, saveCurrentTeam]);

  const handleLoad = useCallback((id: string) => {
    setConfirmLoadId(id);
  }, []);

  const handleConfirmLoad = useCallback(() => {
    if (confirmLoadId) {
      loadTeam(confirmLoadId);
      setConfirmLoadId(null);
      toggleLibrary();
    }
  }, [confirmLoadId, loadTeam, toggleLibrary]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (confirmLoadId) {
        setConfirmLoadId(null);
      } else {
        toggleLibrary();
      }
    }
  }, [confirmLoadId, toggleLibrary]);

  if (!libraryOpen) return null;

  return (
    <div className="team-library-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Load confirmation modal */}
      {confirmLoadId && (
        <div className="team-library-confirm-backdrop">
          <div className="team-library-confirm-dialog">
            <p className="team-library-confirm-text">
              Loading a team will replace your current workspace. Any unsaved changes will be lost.
            </p>
            <div className="team-library-confirm-actions">
              <button className="team-card-btn team-card-btn-load" onClick={handleConfirmLoad}>
                Load Team
              </button>
              <button className="team-card-btn team-card-btn-cancel" onClick={() => setConfirmLoadId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="team-library-page">
        {/* Header */}
        <header className="team-library-header">
          <div className="team-library-title-group">
            <h1 className="team-library-title">Team Library</h1>
            <span className="team-library-count">{teams.length} saved team{teams.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="team-library-close" onClick={toggleLibrary} title="Close library">
            <CloseIcon />
          </button>
        </header>

        {/* Save current team bar */}
        <div className="team-library-save-bar">
          <div className="team-library-save-fields">
            <input
              className="team-library-save-input"
              type="text"
              placeholder="Team name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              maxLength={80}
            />
            <input
              className="team-library-save-input team-library-save-desc"
              type="text"
              placeholder="Description (optional)"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              maxLength={200}
            />
          </div>
          <button
            className="team-library-save-btn"
            onClick={handleSave}
            disabled={!saveName.trim()}
          >
            {saveSuccess ? 'Saved' : 'Save Current Team'}
          </button>
        </div>

        {/* Team list */}
        <div className="team-library-content">
          {teams.length === 0 ? (
            <div className="team-library-empty">
              <div className="team-library-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="team-library-empty-title">No saved teams yet</h3>
              <p className="team-library-empty-text">
                Build a team in the workspace, then save it here to reuse later.
                Give it a name above and click "Save Current Team".
              </p>
            </div>
          ) : (
            <div className="team-library-grid">
              {teams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  onLoad={handleLoad}
                  onDelete={deleteTeam}
                  onRename={renameTeam}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

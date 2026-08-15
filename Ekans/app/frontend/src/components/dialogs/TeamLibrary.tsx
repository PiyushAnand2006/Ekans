/* ================================================================
   TEAM LIBRARY — Full-page overlay to browse, import, and manage teams
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStore } from '@/store/ui-store';
import { useLibraryStore, type SavedTeam } from '@/store/library-store';
import { TeamGraphPreview } from '@/components/canvas/TeamGraphPreview';
import { toast } from '@/components/common/Toast';

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

function TeamCard({ team, isActive, onLoad, onDelete, onRename }: {
  team: SavedTeam;
  isActive: boolean;
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
    <div className={`team-card ${isActive ? 'active-team-card' : ''}`}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <h3
              className="team-card-name"
              onDoubleClick={() => { setEditing(true); setEditName(team.name); }}
              title="Double-click to rename"
            >
              {team.name}
            </h3>
            {isActive && <span className="team-card-active-pill">Active in Workspace</span>}
          </div>
        )}
        <span className="team-card-date">{formatDate(team.savedAt)}</span>
      </div>

      {/* Graphical Agent Hierarchy Preview */}
      <TeamGraphPreview team={team} />

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
        <button
          className={`team-card-btn ${isActive ? 'team-card-btn-active' : 'team-card-btn-load'}`}
          onClick={() => onLoad(team.id)}
          title={isActive ? 'Reload this team in workspace' : 'Import this team to workspace'}
        >
          {isActive ? 'Reload Team' : 'Import Team'}
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
  const openSaveTeamDialog = useUiStore((s) => s.openSaveTeamDialog);
  const teams = useLibraryStore((s) => s.teams);
  const activeTeamId = useLibraryStore((s) => s.activeTeamId);
  const loadFromStorage = useLibraryStore((s) => s.loadFromStorage);
  const loadTeam = useLibraryStore((s) => s.loadTeam);
  const deleteTeam = useLibraryStore((s) => s.deleteTeam);
  const renameTeam = useLibraryStore((s) => s.renameTeam);

  const [search, setSearch] = useState('');
  const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null);

  // Load teams from storage when overlay opens
  useEffect(() => {
    if (libraryOpen) {
      loadFromStorage();
      setSearch('');
      setConfirmLoadId(null);
    }
  }, [libraryOpen, loadFromStorage]);

  const handleLoad = useCallback((id: string) => {
    setConfirmLoadId(id);
  }, []);

  const handleConfirmLoad = useCallback(() => {
    if (confirmLoadId) {
      const target = teams.find((t) => t.id === confirmLoadId);
      loadTeam(confirmLoadId);
      setConfirmLoadId(null);
      toggleLibrary();
      if (target) {
        toast(`Imported team "${target.name}" to workspace`, 'success');
      }
    }
  }, [confirmLoadId, teams, loadTeam, toggleLibrary]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (confirmLoadId) {
        setConfirmLoadId(null);
      } else {
        toggleLibrary();
      }
    }
  }, [confirmLoadId, toggleLibrary]);

  const filteredTeams = teams.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q));
  });

  if (!libraryOpen) return null;

  return (
    <div className="team-library-overlay" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Load confirmation modal */}
      {confirmLoadId && (
        <div className="team-library-confirm-backdrop">
          <div className="team-library-confirm-dialog">
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Import Team</h3>
            <p className="team-library-confirm-text">
              Importing this team will replace your current workspace nodes and relationships. Any unsaved changes in the workspace will be overwritten.
            </p>
            <div className="team-library-confirm-actions">
              <button className="team-card-btn team-card-btn-load" onClick={handleConfirmLoad}>
                Import to Workspace
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                toggleLibrary();
                openSaveTeamDialog();
              }}
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              Save Current Workspace as Team
            </button>
            <button className="team-library-close" onClick={toggleLibrary} title="Close library">
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Search bar if teams exist */}
        {teams.length > 0 && (
          <div className="team-library-search-bar">
            <input
              type="text"
              className="team-library-search-input"
              placeholder="Search saved teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="team-library-search-clear" onClick={() => setSearch('')}>
                Clear
              </button>
            )}
          </div>
        )}

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
                Build your team in the main workspace, then click the "Save Team" button in the toolbar to save it here for fast recall.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  toggleLibrary();
                  openSaveTeamDialog();
                }}
                style={{ marginTop: 8 }}
              >
                Save Current Team
              </button>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="team-library-empty">
              <p className="team-library-empty-text">No teams match "{search}".</p>
              <button className="btn btn-ghost" onClick={() => setSearch('')}>
                Clear Filter
              </button>
            </div>
          ) : (
            <div className="team-library-grid">
              {filteredTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  isActive={team.id === activeTeamId}
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

/* ================================================================
   LIBRARY STORE — Save and manage team configurations
   Persists saved teams to localStorage for quick recall.
   ================================================================ */

import { create } from 'zustand';
import { useOrgStore } from '@/store/org-store';
import type { AgentDefinition, OrganizationRelationship } from '@/types/domain';

const LIBRARY_STORAGE_KEY = 'ekans-team-library';
const ACTIVE_TEAM_STORAGE_KEY = 'ekans-active-team-id';

export interface SavedTeam {
  id: string;
  name: string;
  description: string;
  agents: AgentDefinition[];
  relationships: OrganizationRelationship[];
  positions: Record<string, { x: number; y: number }>;
  orgName: string;
  orgDescription: string;
  agentCount: number;
  savedAt: string;
}

interface LibraryState {
  teams: SavedTeam[];
  activeTeamId: string | null;
  activeTeamName: string | null;
}

interface LibraryActions {
  loadFromStorage: () => void;
  saveCurrentTeamAsNew: (name: string, description?: string) => SavedTeam;
  updateSavedTeam: (id: string, name?: string, description?: string) => boolean;
  loadTeam: (id: string) => boolean;
  deleteTeam: (id: string) => void;
  renameTeam: (id: string, name: string) => void;
  setActiveTeam: (id: string | null, name?: string | null) => void;
  getActiveTeam: () => SavedTeam | null;
}

type LibraryStore = LibraryState & LibraryActions;

function persistTeams(teams: SavedTeam[]) {
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(teams));
  } catch (e) {
    console.error('[Library] Failed to persist teams:', e);
  }
}

function readTeams(): SavedTeam[] {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readActiveTeamId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_TEAM_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function persistActiveTeamId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_TEAM_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_TEAM_STORAGE_KEY);
    }
  } catch (e) {
    console.error('[Library] Failed to persist active team ID:', e);
  }
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  teams: [],
  activeTeamId: null,
  activeTeamName: null,

  loadFromStorage: () => {
    const teams = readTeams();
    const storedActiveId = readActiveTeamId();
    const activeTeam = storedActiveId ? teams.find((t) => t.id === storedActiveId) : null;
    set({
      teams,
      activeTeamId: activeTeam ? activeTeam.id : null,
      activeTeamName: activeTeam ? activeTeam.name : null,
    });
  },

  setActiveTeam: (id, name = null) => {
    persistActiveTeamId(id);
    set({ activeTeamId: id, activeTeamName: name });
  },

  getActiveTeam: () => {
    const { teams, activeTeamId } = get();
    if (!activeTeamId) return null;
    return teams.find((t) => t.id === activeTeamId) || null;
  },

  saveCurrentTeamAsNew: (name, description = '') => {
    const orgState = useOrgStore.getState().toSerializable();
    const teamName = name.trim() || 'Untitled Team';
    const team: SavedTeam = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: teamName,
      description: description.trim(),
      agents: orgState.agents,
      relationships: orgState.relationships,
      positions: orgState.positions,
      orgName: orgState.orgName,
      orgDescription: orgState.orgDescription,
      agentCount: orgState.agents.length,
      savedAt: new Date().toISOString(),
    };
    const next = [team, ...get().teams];
    set({ teams: next, activeTeamId: team.id, activeTeamName: team.name });
    persistTeams(next);
    persistActiveTeamId(team.id);
    return team;
  },

  updateSavedTeam: (id, name, description) => {
    const orgState = useOrgStore.getState().toSerializable();
    const existing = get().teams.find((t) => t.id === id);
    if (!existing) return false;

    const updatedName = name !== undefined ? name.trim() || existing.name : existing.name;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;

    const next = get().teams.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          name: updatedName,
          description: updatedDesc,
          agents: orgState.agents,
          relationships: orgState.relationships,
          positions: orgState.positions,
          orgName: orgState.orgName,
          orgDescription: orgState.orgDescription,
          agentCount: orgState.agents.length,
          savedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    set({ teams: next, activeTeamId: id, activeTeamName: updatedName });
    persistTeams(next);
    persistActiveTeamId(id);
    return true;
  },

  loadTeam: (id) => {
    const team = get().teams.find((t) => t.id === id);
    if (!team) return false;
    useOrgStore.getState().fromSerializable({
      agents: team.agents,
      relationships: team.relationships,
      positions: team.positions,
      orgName: team.orgName,
      orgDescription: team.orgDescription,
    });
    set({ activeTeamId: team.id, activeTeamName: team.name });
    persistActiveTeamId(team.id);
    return true;
  },

  deleteTeam: (id) => {
    const { activeTeamId } = get();
    const next = get().teams.filter((t) => t.id !== id);
    const newActiveId = activeTeamId === id ? null : activeTeamId;
    const newActiveTeam = newActiveId ? next.find((t) => t.id === newActiveId) : null;
    set({
      teams: next,
      activeTeamId: newActiveId,
      activeTeamName: newActiveTeam ? newActiveTeam.name : null,
    });
    persistTeams(next);
    persistActiveTeamId(newActiveId);
  },

  renameTeam: (id, name) => {
    const next = get().teams.map((t) =>
      t.id === id ? { ...t, name: name.trim() || t.name } : t,
    );
    const { activeTeamId } = get();
    const activeTeam = activeTeamId ? next.find((t) => t.id === activeTeamId) : null;
    set({
      teams: next,
      activeTeamName: activeTeam ? activeTeam.name : null,
    });
    persistTeams(next);
  },
}));


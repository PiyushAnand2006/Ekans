/* ================================================================
   LIBRARY STORE — Save and manage team configurations
   Persists saved teams to localStorage for quick recall.
   ================================================================ */

import { create } from 'zustand';
import { useOrgStore } from '@/store/org-store';
import type { AgentDefinition, OrganizationRelationship } from '@/types/domain';

const LIBRARY_STORAGE_KEY = 'ekans-team-library';

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
}

interface LibraryActions {
  loadFromStorage: () => void;
  saveCurrentTeam: (name: string, description?: string) => SavedTeam;
  loadTeam: (id: string) => boolean;
  deleteTeam: (id: string) => void;
  renameTeam: (id: string, name: string) => void;
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

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  teams: [],

  loadFromStorage: () => {
    set({ teams: readTeams() });
  },

  saveCurrentTeam: (name, description = '') => {
    const orgState = useOrgStore.getState().toSerializable();
    const team: SavedTeam = {
      id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || 'Untitled Team',
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
    set({ teams: next });
    persistTeams(next);
    return team;
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
    return true;
  },

  deleteTeam: (id) => {
    const next = get().teams.filter((t) => t.id !== id);
    set({ teams: next });
    persistTeams(next);
  },

  renameTeam: (id, name) => {
    const next = get().teams.map((t) =>
      t.id === id ? { ...t, name: name.trim() || t.name } : t,
    );
    set({ teams: next });
    persistTeams(next);
  },
}));

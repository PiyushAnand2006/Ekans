/* ================================================================
   VAULT STORE — Auto-persist org state to Obsidian-style vault
   Uses localStorage as backend with debounced auto-save.
   ================================================================ */

import { create } from 'zustand';
import { useOrgStore } from '@/store/org-store';
import { useSettingsStore } from '@/store/settings-store';
import {
  serializeToVault,
  deserializeFromVault,
  downloadVault,
  readVaultFile,
  type VaultData,
  type VaultRunSummary,
} from '@/memory/vault';

const VAULT_STORAGE_KEY = 'ekans-vault';
const VAULT_VERSION = 1;

interface VaultState {
  lastSaved: string | null;
  lastLoaded: string | null;
  isDirty: boolean;
  runHistory: VaultRunSummary[];
  autoSaveTimer: ReturnType<typeof setTimeout> | null;
}

interface VaultActions {
  save: () => void;
  load: () => boolean;
  exportFile: (filename?: string) => void;
  importFile: (file: File) => Promise<boolean>;
  addRunSummary: (run: VaultRunSummary) => void;
  scheduleAutoSave: () => void;
  getVaultMarkdown: () => string;
}

type VaultStore = VaultState & VaultActions;

function buildVaultData(): VaultData {
  const orgStore = useOrgStore.getState();
  const settings = useSettingsStore.getState();
  const vaultStore = useVaultStore.getState();
  const serialized = orgStore.toSerializable();

  return {
    orgName: serialized.orgName || 'My AI Organization',
    orgDescription: serialized.orgDescription || '',
    version: VAULT_VERSION,
    created: vaultStore.lastLoaded || new Date().toISOString(),
    updated: new Date().toISOString(),
    agents: serialized.agents,
    relationships: serialized.relationships,
    positions: serialized.positions,
    settingsSnapshot: {
      defaultProvider: settings.defaultProvider,
      defaultModel: settings.defaultModel,
      configuredProviders: settings.getActiveProviders(),
    },
    runHistory: vaultStore.runHistory,
  };
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  lastSaved: null,
  lastLoaded: null,
  isDirty: false,
  runHistory: [],
  autoSaveTimer: null,

  save: () => {
    try {
      const data = buildVaultData();
      const md = serializeToVault(data);
      localStorage.setItem(VAULT_STORAGE_KEY, md);
      const now = new Date().toISOString();
      set({ lastSaved: now, isDirty: false });
    } catch (e) {
      console.error('[Vault] Failed to save:', e);
    }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      if (!raw) return false;

      const data = deserializeFromVault(raw);
      if (!data) return false;

      // Load into org store
      const orgStore = useOrgStore.getState();
      orgStore.fromSerializable({
        agents: data.agents,
        relationships: data.relationships,
        positions: data.positions,
        orgName: data.orgName,
        orgDescription: data.orgDescription,
      });

      set({
        lastLoaded: new Date().toISOString(),
        isDirty: false,
        runHistory: data.runHistory || [],
      });

      return true;
    } catch (e) {
      console.error('[Vault] Failed to load:', e);
      return false;
    }
  },

  exportFile: (filename) => {
    const data = buildVaultData();
    downloadVault(data, filename);
  },

  importFile: async (file) => {
    try {
      const data = await readVaultFile(file);
      if (!data) return false;

      const orgStore = useOrgStore.getState();
      orgStore.fromSerializable({
        agents: data.agents,
        relationships: data.relationships,
        positions: data.positions,
        orgName: data.orgName,
        orgDescription: data.orgDescription,
      });

      set({
        lastLoaded: new Date().toISOString(),
        isDirty: false,
        runHistory: data.runHistory || [],
      });

      // Auto-save to localStorage
      get().save();
      return true;
    } catch (e) {
      console.error('[Vault] Failed to import:', e);
      return false;
    }
  },

  addRunSummary: (run) => {
    set((state) => ({
      runHistory: [...state.runHistory, run],
      isDirty: true,
    }));
    get().scheduleAutoSave();
  },

  scheduleAutoSave: () => {
    const settings = useSettingsStore.getState();
    if (!settings.autoSave) return;

    const { autoSaveTimer } = get();
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    const timer = setTimeout(() => {
      get().save();
    }, settings.autoSaveIntervalMs || 1000);

    set({ autoSaveTimer: timer, isDirty: true });
  },

  getVaultMarkdown: () => {
    const data = buildVaultData();
    return serializeToVault(data);
  },
}));

// ── Auto-save subscription ───────────────────────────────────────
// Subscribe to org store changes and trigger vault auto-save

let _subscribed = false;

export function initVaultAutoSave() {
  if (_subscribed) return;
  _subscribed = true;

  // Load vault on first init
  const loaded = useVaultStore.getState().load();
  if (!loaded) {
    // First time — save the default sample org
    useVaultStore.getState().save();
  }

  // Subscribe to org store changes
  useOrgStore.subscribe(() => {
    useVaultStore.getState().scheduleAutoSave();
  });
}

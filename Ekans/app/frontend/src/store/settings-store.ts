import { create } from 'zustand';

/* ================================================================
   SETTINGS STORE — Ekans AI Workforce Builder
   Persists API keys and default model configuration to localStorage.
   API keys are stored in localStorage (never in source code).
   ================================================================ */

export interface ProviderConfig {
  key: string;
  configured: boolean;
}

export interface SettingsState {
  // API Keys per provider
  providers: {
    openai: ProviderConfig;
    anthropic: ProviderConfig;
    google: ProviderConfig;
    openrouter: ProviderConfig;
    ollama: { url: string; configured: boolean };
    'openai-compatible': { key: string; url: string; configured: boolean };
  };

  // Default model settings (used when creating new agents)
  defaultProvider: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;

  // Vault settings
  autoSave: boolean;
  autoSaveIntervalMs: number;
}

interface SettingsActions {
  setProviderKey: (provider: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible', key: string) => void;
  setOllamaUrl: (url: string) => void;
  setOpenAICompatible: (key: string, url: string) => void;
  setDefaults: (provider: string, model: string, temperature: number, maxTokens: number) => void;
  setAutoSave: (enabled: boolean) => void;
  clearProviderKey: (provider: string) => void;
  getActiveProviders: () => string[];
  hasAnyKey: () => boolean;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

type SettingsStore = SettingsState & SettingsActions;

const STORAGE_KEY = 'ekans-settings';

function loadSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveSettings(state: SettingsState) {
  try {
    const serializable = {
      providers: state.providers,
      defaultProvider: state.defaultProvider,
      defaultModel: state.defaultModel,
      defaultTemperature: state.defaultTemperature,
      defaultMaxTokens: state.defaultMaxTokens,
      autoSave: state.autoSave,
      autoSaveIntervalMs: state.autoSaveIntervalMs,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage errors
  }
}

const defaultState: SettingsState = {
  providers: {
    openai: { key: '', configured: false },
    anthropic: { key: '', configured: false },
    google: { key: '', configured: false },
    openrouter: { key: '', configured: false },
    ollama: { url: 'http://localhost:11434', configured: false },
    'openai-compatible': { key: '', url: '', configured: false },
  },
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  autoSave: true,
  autoSaveIntervalMs: 1000,
};

function mergeSettings(saved: Partial<SettingsState>): SettingsState {
  return {
    ...defaultState,
    ...saved,
    providers: {
      ...defaultState.providers,
      ...(saved.providers || {}),
    },
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = mergeSettings(loadSettings());

  return {
    ...initial,

    setProviderKey: (provider, key) => {
      set((state) => {
        const providers = { ...state.providers };
        if (provider === 'openai-compatible') {
          providers['openai-compatible'] = {
            ...providers['openai-compatible'],
            key,
            configured: key.length > 0 && providers['openai-compatible'].url.length > 0,
          };
        } else if (provider === 'openrouter') {
          providers.openrouter = { key, configured: key.length > 0 };
        } else {
          providers[provider] = { key, configured: key.length > 0 };
        }
        const next = { ...state, providers };
        saveSettings(next);
        return { providers };
      });
    },

    setOllamaUrl: (url) => {
      set((state) => {
        const providers = {
          ...state.providers,
          ollama: { url, configured: url.length > 0 },
        };
        const next = { ...state, providers };
        saveSettings(next);
        return { providers };
      });
    },

    setOpenAICompatible: (key, url) => {
      set((state) => {
        const providers = {
          ...state.providers,
          'openai-compatible': { key, url, configured: key.length > 0 && url.length > 0 },
        };
        const next = { ...state, providers };
        saveSettings(next);
        return { providers };
      });
    },

    setDefaults: (provider, model, temperature, maxTokens) => {
      set((state) => {
        const next = {
          ...state,
          defaultProvider: provider,
          defaultModel: model,
          defaultTemperature: temperature,
          defaultMaxTokens: maxTokens,
        };
        saveSettings(next);
        return {
          defaultProvider: provider,
          defaultModel: model,
          defaultTemperature: temperature,
          defaultMaxTokens: maxTokens,
        };
      });
    },

    setAutoSave: (enabled) => {
      set((state) => {
        const next = { ...state, autoSave: enabled };
        saveSettings(next);
        return { autoSave: enabled };
      });
    },

    clearProviderKey: (provider) => {
      set((state) => {
        const providers = { ...state.providers };
        if (provider === 'ollama') {
          providers.ollama = { url: 'http://localhost:11434', configured: false };
        } else if (provider === 'openai-compatible') {
          providers['openai-compatible'] = { key: '', url: '', configured: false };
        } else if (provider === 'openrouter') {
          providers.openrouter = { key: '', configured: false };
        } else {
          const p = provider as 'openai' | 'anthropic' | 'google';
          providers[p] = { key: '', configured: false };
        }
        const next = { ...state, providers };
        saveSettings(next);
        return { providers };
      });
    },

    getActiveProviders: () => {
      const { providers } = get();
      const active: string[] = [];
      if (providers.openai.configured) active.push('openai');
      if (providers.anthropic.configured) active.push('anthropic');
      if (providers.google.configured) active.push('google');
      if (providers.openrouter.configured) active.push('openrouter');
      if (providers.ollama.configured) active.push('ollama');
      if (providers['openai-compatible'].configured) active.push('openai-compatible');
      return active;
    },

    hasAnyKey: () => {
      const { providers } = get();
      return (
        providers.openai.configured ||
        providers.anthropic.configured ||
        providers.google.configured ||
        providers.openrouter.configured ||
        providers.ollama.configured ||
        providers['openai-compatible'].configured
      );
    },

    loadFromStorage: () => {
      const saved = loadSettings();
      set(mergeSettings(saved));
    },

    saveToStorage: () => {
      saveSettings(get());
    },
  };
});

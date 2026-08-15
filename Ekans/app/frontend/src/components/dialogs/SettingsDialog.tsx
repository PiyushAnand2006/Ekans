import { useState } from 'react';
import { useSettingsStore } from '@/store/settings-store';
import { useUiStore } from '@/store/ui-store';

type Tab = 'keys' | 'defaults' | 'about';

const PROVIDER_INFO: Record<string, { label: string; placeholder: string; icon: string; helpUrl: string }> = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-...',
    icon: '',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    icon: '',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    label: 'Google AI',
    placeholder: 'AIza...',
    icon: '',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
  openrouter: {
    label: 'OpenRouter',
    placeholder: 'sk-or-v1-...',
    icon: '',
    helpUrl: 'https://openrouter.ai/keys',
  },
};

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-3-20250414'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  openrouter: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'anthropic/claude-sonnet-4-20250514', 'meta-llama/llama-3.1-8b-instruct'],
  ollama: ['llama3.3', 'mistral', 'deepseek-r1', 'qwen3', 'gemma3'],
  'openai-compatible': [],
};

export function SettingsDialog() {
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const [tab, setTab] = useState<Tab>('keys');

  if (!settingsOpen) return null;

  return (
    <div className="dialog-overlay" onClick={toggleSettings}>
      <div
        className="settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-title">
            <span>Settings</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={toggleSettings}>x</button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'keys' ? 'active' : ''}`}
            onClick={() => setTab('keys')}
          >
            API Keys
          </button>
          <button
            className={`settings-tab ${tab === 'defaults' ? 'active' : ''}`}
            onClick={() => setTab('defaults')}
          >
            Defaults
          </button>
          <button
            className={`settings-tab ${tab === 'about' ? 'active' : ''}`}
            onClick={() => setTab('about')}
          >
            About
          </button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {tab === 'keys' && <ApiKeysTab />}
          {tab === 'defaults' && <DefaultsTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

// ── API Keys Tab ─────────────────────────────────────────────────

function ApiKeysTab() {
  const providers = useSettingsStore((s) => s.providers);
  const setProviderKey = useSettingsStore((s) => s.setProviderKey);
  const setOllamaUrl = useSettingsStore((s) => s.setOllamaUrl);
  const setOpenAICompatible = useSettingsStore((s) => s.setOpenAICompatible);
  const clearProviderKey = useSettingsStore((s) => s.clearProviderKey);

  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const toggleVisible = (provider: string) => {
    setVisibleKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-info-banner">
        <span>API keys are stored locally in your browser. They are never sent to any server except the respective LLM provider.</span>
      </div>

      {/* Standard providers */}
      {Object.entries(PROVIDER_INFO).map(([key, info]) => {
        const provider = providers[key as keyof typeof providers] as { key: string; configured: boolean };
        return (
          <div key={key} className="settings-key-group">
            <div className="settings-key-header">
              <div className="settings-key-label">
                <span>{info.label}</span>
                <span className={`settings-status-dot ${provider.configured ? 'configured' : 'not-configured'}`} />
                <span className="settings-status-text">
                  {provider.configured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <a
                className="settings-help-link"
                href={info.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get key
              </a>
            </div>
            <div className="settings-key-input-row">
              <div className="settings-key-input-wrapper">
                <input
                  className="input settings-key-input"
                  type={visibleKeys[key] ? 'text' : 'password'}
                  value={provider.key}
                  onChange={(e) => setProviderKey(key as 'openai' | 'anthropic' | 'google' | 'openrouter', e.target.value)}
                  placeholder={info.placeholder}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="btn btn-ghost btn-icon settings-eye-btn"
                  onClick={() => toggleVisible(key)}
                  title={visibleKeys[key] ? 'Hide key' : 'Show key'}
                >
                  {visibleKeys[key] ? 'Hide' : 'Show'}
                </button>
              </div>
              {provider.configured && (
                <button
                  className="btn btn-ghost btn-sm settings-clear-btn"
                  onClick={() => clearProviderKey(key)}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Ollama */}
      <div className="settings-key-group">
        <div className="settings-key-header">
          <div className="settings-key-label">
            <span>Ollama (Local)</span>
            <span className={`settings-status-dot ${providers.ollama.configured ? 'configured' : 'not-configured'}`} />
            <span className="settings-status-text">
              {providers.ollama.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <a
            className="settings-help-link"
            href="https://ollama.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download Ollama
          </a>
        </div>
        <div className="settings-key-input-row">
          <input
            className="input settings-key-input"
            type="text"
            value={providers.ollama.url}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
          {providers.ollama.configured && (
            <button
              className="btn btn-ghost btn-sm settings-clear-btn"
              onClick={() => clearProviderKey('ollama')}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* OpenAI Compatible */}
      <div className="settings-key-group">
        <div className="settings-key-header">
          <div className="settings-key-label">
            <span>OpenAI-Compatible API</span>
            <span className={`settings-status-dot ${providers['openai-compatible'].configured ? 'configured' : 'not-configured'}`} />
            <span className="settings-status-text">
              {providers['openai-compatible'].configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
        </div>
        <div className="settings-key-input-row" style={{ flexDirection: 'column', gap: 8 }}>
          <input
            className="input settings-key-input"
            type="text"
            value={providers['openai-compatible'].url}
            onChange={(e) => setOpenAICompatible(providers['openai-compatible'].key, e.target.value)}
            placeholder="Base URL (e.g., https://api.together.xyz/v1)"
          />
          <div className="settings-key-input-wrapper">
            <input
              className="input settings-key-input"
              type={visibleKeys['openai-compatible'] ? 'text' : 'password'}
              value={providers['openai-compatible'].key}
              onChange={(e) => setOpenAICompatible(e.target.value, providers['openai-compatible'].url)}
              placeholder="API Key"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="btn btn-ghost btn-icon settings-eye-btn"
              onClick={() => toggleVisible('openai-compatible')}
              title={visibleKeys['openai-compatible'] ? 'Hide key' : 'Show key'}
            >
              {visibleKeys['openai-compatible'] ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {/* OpenRouter */}
      <div className="settings-key-group">
        <div className="settings-key-header">
          <div className="settings-key-label">
            <span>OpenRouter</span>
            <span className={`settings-status-dot ${providers.openrouter.configured ? 'configured' : 'not-configured'}`} />
            <span className="settings-status-text">
              {providers.openrouter.configured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <a
            className="settings-help-link"
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get key
          </a>
        </div>
        <div className="settings-key-input-row">
          <div className="settings-key-input-wrapper">
            <input
              className="input settings-key-input"
              type={visibleKeys.openrouter ? 'text' : 'password'}
              value={providers.openrouter.key}
              onChange={(e) => setProviderKey('openrouter', e.target.value)}
              placeholder="sk-or-v1-..."
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="btn btn-ghost btn-icon settings-eye-btn"
              onClick={() => toggleVisible('openrouter')}
              title={visibleKeys.openrouter ? 'Hide key' : 'Show key'}
            >
              {visibleKeys.openrouter ? 'Hide' : 'Show'}
            </button>
          </div>
          {providers.openrouter.configured && (
            <button
              className="btn btn-ghost btn-sm settings-clear-btn"
              onClick={() => clearProviderKey('openrouter')}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Defaults Tab ─────────────────────────────────────────────────

function DefaultsTab() {
  const settings = useSettingsStore();
  const activeProviders = settings.getActiveProviders();

  const providerOptions = ['openai', 'anthropic', 'google', 'openrouter', 'ollama', 'openai-compatible'];
  const suggestions = MODEL_SUGGESTIONS[settings.defaultProvider] || [];

  return (
    <div className="settings-tab-content">
      <div className="settings-info-banner">
        <span>These defaults are applied when creating new agents. You can override them per-agent in the inspector.</span>
      </div>

      <div className="settings-key-group">
        <label className="label">Default Provider</label>
        <select
          className="select"
          value={settings.defaultProvider}
          onChange={(e) =>
            settings.setDefaults(e.target.value, settings.defaultModel, settings.defaultTemperature, settings.defaultMaxTokens)
          }
        >
          {providerOptions.map((p) => (
            <option key={p} value={p}>
              {p} {activeProviders.includes(p) ? '[configured]' : '(not configured)'}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-key-group">
        <label className="label">Default Model</label>
        <input
          className="input"
          value={settings.defaultModel}
          onChange={(e) =>
            settings.setDefaults(settings.defaultProvider, e.target.value, settings.defaultTemperature, settings.defaultMaxTokens)
          }
          placeholder="Model name"
          list="model-suggestions"
        />
        {suggestions.length > 0 && (
          <datalist id="model-suggestions">
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="settings-key-group" style={{ flex: 1 }}>
          <label className="label">Temperature</label>
          <input
            className="input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={settings.defaultTemperature}
            onChange={(e) =>
              settings.setDefaults(
                settings.defaultProvider,
                settings.defaultModel,
                parseFloat(e.target.value) || 0.7,
                settings.defaultMaxTokens
              )
            }
          />
        </div>
        <div className="settings-key-group" style={{ flex: 1 }}>
          <label className="label">Max Tokens</label>
          <input
            className="input"
            type="number"
            min={100}
            step={100}
            value={settings.defaultMaxTokens}
            onChange={(e) =>
              settings.setDefaults(
                settings.defaultProvider,
                settings.defaultModel,
                settings.defaultTemperature,
                parseInt(e.target.value) || 4096
              )
            }
          />
        </div>
      </div>

      <div className="settings-key-group">
        <label className="label">Auto-Save Vault</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`settings-toggle ${settings.autoSave ? 'active' : ''}`}
            onClick={() => settings.setAutoSave(!settings.autoSave)}
          >
            <span className="settings-toggle-thumb" />
          </button>
          <span className="settings-status-text">
            {settings.autoSave ? 'Enabled — organization auto-saves to vault' : 'Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── About Tab ────────────────────────────────────────────────────

function AboutTab() {
  return (
    <div className="settings-tab-content">
      <div className="settings-about">
        <h2 className="settings-about-name">Ekans</h2>
        <p className="settings-about-tagline">AI Workforce Builder</p>
        <p className="settings-about-version">v0.1.0</p>
        <div className="settings-about-description">
          <p>
            A visual operating system for creating and running AI workforces.
            Build organizations of AI agents, define roles and hierarchies,
            and let them work autonomously on your objectives.
          </p>
        </div>
        <div className="settings-about-credits">
          <div className="settings-about-credit-item">
            <span>Built with React, TypeScript, React Flow, Zustand</span>
          </div>
          <div className="settings-about-credit-item">
            <span>Obsidian-style vault memory system</span>
          </div>
          <div className="settings-about-credit-item">
            <span>Multi-provider LLM support (OpenAI, Anthropic, Google, OpenRouter, Ollama)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelRun, fetchRun, fetchRunEvents, startRun } from '@/services/api-client';
import { extractCodeBlocks, isFileSystemAccessSupported, saveCodeBlocks, getSelectedDirectoryName, pickDirectory, clearDirectoryHandle } from '@/services/file-system-service';
import type { CodeBlock } from '@/services/file-system-service';
import { downloadZip } from '@/services/zip-service';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { useOrgStore } from '@/store/org-store';
import { useRuntimeStore } from '@/store/runtime-store';
import { useSettingsStore } from '@/store/settings-store';
import type { AgentDefinition, OrganizationDefinition, RuntimeEvent, TaskDefinition } from '@/types/domain';

function providerKeys() {
  const providers = useSettingsStore.getState().providers;
  return { openai: providers.openai.key, anthropic: providers.anthropic.key, google: providers.google.key,
    openrouter: providers.openrouter.key, ollama_url: providers.ollama.url, openai_compatible_key: providers['openai-compatible'].key,
    openai_compatible_url: providers['openai-compatible'].url };
}

type VerifiedRunResult = {
  text?: string;
  verification?: { is_software?: boolean; passed?: boolean; issues?: Array<{ message?: string }> };
  files?: Array<{ path: string; content: string; language?: string }>;
  agent_messages?: Array<{
    id: string; from: string; to: string; subject: string;
    body: string; reply: string; resolved: boolean;
    created_at: string; resolved_at: string | null;
  }>;
};

function verifiedCodeFiles(result: VerifiedRunResult | null): CodeBlock[] {
  // Accept files whenever the backend extracted at least one file, regardless
  // of the advisory verification flag.
  if (!Array.isArray(result?.files) || result.files.length === 0) return [];
  return result.files
    .filter((file) => typeof file.path === 'string' && typeof file.content === 'string')
    .map((file) => ({ filename: file.path, content: file.content, language: file.language || '', isCode: true }));
}

function updateAgentStatus(event: RuntimeEvent) {
  if (!event.agent_id) return;
  const store = useOrgStore.getState();
  if (event.category === 'TASK_STARTED' || event.category === 'AGENT_THINKING') store.setAgentStatus(event.agent_id, 'WORKING');
  if (event.category === 'AGENT_BLOCKED') store.setAgentStatus(event.agent_id, 'WAITING');
  if (event.category === 'AGENT_UNBLOCKED') store.setAgentStatus(event.agent_id, 'WORKING');
  if (event.category === 'TASK_COMPLETED') store.setAgentStatus(event.agent_id, 'COMPLETED');
  if (event.category === 'TASK_FAILED' || event.category === 'RUN_FAILED') store.setAgentStatus(event.agent_id, 'FAILED');
}

const SCROLL_THRESHOLD = 40;

// ── SVG Icons ────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function statusColor(status: string): string {
  switch (status) {
    case 'COMPLETED': return '#34d399';
    case 'FAILED': return '#f87171';
    case 'RUNNING': case 'WORKING': return '#60a5fa';
    case 'PENDING': case 'ASSIGNED': return '#a78bfa';
    default: return 'var(--text-secondary)';
  }
}

// ── SVG Icons (small) ────────────────────────────────────────────

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ZipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

// ── Save Code Button ─────────────────────────────────────────────

function SaveCodeButton({ content }: { content: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dirName, setDirName] = useState(getSelectedDirectoryName());

  if (!isFileSystemAccessSupported()) return null;

  const codeBlocks = extractCodeBlocks(content).filter((b) => b.isCode);
  if (codeBlocks.length === 0) return null;

  const handleSave = async () => {
    setStatus('saving');
    try {
      const result = await saveCodeBlocks(codeBlocks);
      setDirName(getSelectedDirectoryName());
      if (result.success) {
        setStatus('done');
        setMessage(`Saved ${result.filesWritten.length} file${result.filesWritten.length === 1 ? '' : 's'}: ${result.filesWritten.join(', ')}`);
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Save failed');
        setTimeout(() => setStatus('idle'), 4000);
      }
    } catch {
      setStatus('error');
      setMessage('Save cancelled or failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleChangeDir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      clearDirectoryHandle();
      await pickDirectory();
      setDirName(getSelectedDirectoryName());
    } catch { /* user cancelled */ }
  };

  return (
    <div className="save-code-bar">
      <div className="save-code-bar-left">
        <button
          className={`save-code-btn${status === 'done' ? ' save-code-btn-done' : ''}${status === 'error' ? ' save-code-btn-error' : ''}`}
          onClick={() => void handleSave()}
          disabled={status === 'saving'}
          title={`Save ${codeBlocks.length} code file${codeBlocks.length === 1 ? '' : 's'} to disk`}
        >
          {status === 'done' ? <CheckIcon /> : <SaveIcon />}
          {status === 'saving' ? 'Saving…' : status === 'done' ? 'Saved!' : `Save ${codeBlocks.length} file${codeBlocks.length === 1 ? '' : 's'}`}
        </button>
        {dirName && (
          <button className="save-code-dir-btn" onClick={(e) => void handleChangeDir(e)} title="Change save directory">
            <FolderIcon />
            {dirName}
          </button>
        )}
      </div>
      {message && status !== 'idle' && (
        <span className={`save-code-msg${status === 'error' ? ' save-code-msg-error' : ''}`}>{message}</span>
      )}
    </div>
  );
}

// ── Full Codebase Exporter Bar ────────────────────────────────────

interface FullCodebaseExportBarProps { codeFiles: CodeBlock[]; }

function FullCodebaseExportBar({ codeFiles }: FullCodebaseExportBarProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dirName, setDirName] = useState(getSelectedDirectoryName());

  if (codeFiles.length === 0) return null;

  const handleExportZip = () => {
    try {
      downloadZip(
        codeFiles.map((f) => ({ filename: f.filename, content: f.content })),
        'ekans-codebase.zip'
      );
      setStatus('done');
      setMessage(`Downloaded zip with ${codeFiles.length} file${codeFiles.length === 1 ? '' : 's'}!`);
      setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setStatus('error');
      setMessage('Failed to generate zip file');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  const handleExportDirectory = async () => {
    setStatus('saving');
    try {
      const result = await saveCodeBlocks(codeFiles);
      setDirName(getSelectedDirectoryName());
      if (result.success) {
        setStatus('done');
        setMessage(`Exported ${result.filesWritten.length} file${result.filesWritten.length === 1 ? '' : 's'} to local folder!`);
        setTimeout(() => setStatus('idle'), 5000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Export failed');
        setTimeout(() => setStatus('idle'), 4000);
      }
    } catch {
      setStatus('error');
      setMessage('Export cancelled or failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleChangeDir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      clearDirectoryHandle();
      await pickDirectory();
      setDirName(getSelectedDirectoryName());
    } catch { /* user cancelled */ }
  };

  return (
    <div className="full-codebase-export-card">
      <div className="full-codebase-export-header">
        <div className="full-codebase-title">
          <ZipIcon />
          <span>Full Generated Codebase</span>
          <span className="full-codebase-badge">{codeFiles.length} file{codeFiles.length === 1 ? '' : 's'}</span>
        </div>
        {dirName && (
          <button className="save-code-dir-btn" onClick={(e) => void handleChangeDir(e)} title="Change target directory">
            <FolderIcon />
            {dirName}
          </button>
        )}
      </div>

      <div className="full-codebase-files-preview">
        {codeFiles.slice(0, 4).map((f, i) => (
          <span key={i} className="codebase-file-tag">{f.filename}</span>
        ))}
        {codeFiles.length > 4 && (
          <span className="codebase-file-more">+{codeFiles.length - 4} more</span>
        )}
      </div>

      <div className="full-codebase-actions">
        <button
          className="full-export-btn full-export-zip-btn"
          onClick={handleExportZip}
          title="Download complete codebase as a single .zip file (preserves folder structure)"
        >
          <DownloadIcon />
          <span>Download .zip</span>
        </button>

        {isFileSystemAccessSupported() && (
          <button
            className={`full-export-btn full-export-dir-btn${status === 'done' ? ' done' : ''}`}
            onClick={() => void handleExportDirectory()}
            disabled={status === 'saving'}
            title="Export all generated files directly into your local workspace folder"
          >
            {status === 'done' ? <CheckIcon /> : <FolderIcon />}
            <span>{status === 'saving' ? 'Exporting…' : status === 'done' ? 'Exported!' : 'Sync to Local Folder'}</span>
          </button>
        )}
      </div>

      {message && status !== 'idle' && (
        <div className={`full-export-msg${status === 'error' ? ' error' : ''}`}>{message}</div>
      )}
    </div>
  );
}

// ── Agent Task Card ──────────────────────────────────────────────

interface AgentTaskCardProps {
  task: TaskDefinition;
  agent: AgentDefinition | undefined;
  agentsById: Map<string, AgentDefinition>;
  agentEvents: RuntimeEvent[];
}

function AgentTaskCard({ task, agent, agentsById, agentEvents }: AgentTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const taskResult = task.result as { text?: string } | null;
  const requestedBy = task.requested_by_agent_id ? agentsById.get(task.requested_by_agent_id) : null;
  const totalTokens = task.cost.input_tokens + task.cost.output_tokens;

  return (
    <div className="agent-task-card">
      <button
        className="agent-task-card-header"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className="agent-task-card-chevron" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>
          <ChevronRightIcon />
        </div>
        <div
          className="agent-task-card-dot"
          style={{ background: agent?.color || '#4a9eff' }}
        />
        <div className="agent-task-card-title">
          <span className="agent-task-card-name">{agent?.name || task.assigned_agent_id}</span>
          <span className="agent-task-card-role">{agent?.role || 'Agent'}</span>
        </div>
        <span
          className="agent-task-card-status"
          style={{ color: statusColor(task.status) }}
        >
          {task.status}
        </span>
        {totalTokens > 0 && (
          <span className="agent-task-card-tokens">{formatTokens(totalTokens)} tok</span>
        )}
        <span className="agent-task-card-time">
          {formatDuration(task.started_at, task.completed_at)}
        </span>
      </button>

      {expanded && (
        <div className="agent-task-card-body">
          {/* Context Routing */}
          <div className="agent-task-card-section">
            <div className="agent-task-card-section-label">Context Routing</div>
            <div className="agent-task-card-meta-grid">
              <div className="agent-task-meta-item">
                <span className="meta-label">Assigned to</span>
                <span className="meta-value">{agent?.name || task.assigned_agent_id}</span>
              </div>
              <div className="agent-task-meta-item">
                <span className="meta-label">Delegated by</span>
                <span className="meta-value">{requestedBy?.name || task.requested_by_agent_id || '—'}</span>
              </div>
              <div className="agent-task-meta-item">
                <span className="meta-label">Task</span>
                <span className="meta-value">{task.title || '—'}</span>
              </div>
              {task.dependencies.length > 0 && (
                <div className="agent-task-meta-item">
                  <span className="meta-label">Depends on</span>
                  <span className="meta-value">{task.dependencies.length} task(s)</span>
                </div>
              )}
            </div>
          </div>

          {/* Cost & Tokens */}
          <div className="agent-task-card-section">
            <div className="agent-task-card-section-label">Cost & Token Usage</div>
            <div className="agent-task-card-stats">
              <div className="agent-task-stat">
                <span className="stat-value">{formatTokens(task.cost.input_tokens)}</span>
                <span className="stat-label">Input tokens</span>
              </div>
              <div className="agent-task-stat">
                <span className="stat-value">{formatTokens(task.cost.output_tokens)}</span>
                <span className="stat-label">Output tokens</span>
              </div>
              <div className="agent-task-stat">
                <span className="stat-value">${task.cost.estimated_cost.toFixed(4)}</span>
                <span className="stat-label">Est. cost</span>
              </div>
              <div className="agent-task-stat">
                <span className="stat-value">{formatDuration(task.started_at, task.completed_at)}</span>
                <span className="stat-label">Duration</span>
              </div>
            </div>
          </div>

          {/* Agent Activity */}
          {agentEvents.length > 0 && (
            <div className="agent-task-card-section">
              <div className="agent-task-card-section-label">Activity ({agentEvents.length} events)</div>
              <div className="agent-task-card-events">
                {agentEvents.map((ev) => (
                  <div key={ev.id} className="agent-event-row">
                    <span className="agent-event-category">{ev.category.replaceAll('_', ' ')}</span>
                    <span className="agent-event-msg">{ev.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          <div className="agent-task-card-section">
            <div className="agent-task-card-section-label">Output</div>
            <div className="agent-task-card-output">
              <MarkdownRenderer content={taskResult?.text || task.error || 'No response available.'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Communications Panel ───────────────────────────────────

type AgentMsg = NonNullable<VerifiedRunResult['agent_messages']>[number];

function AgentCommsPanel({ messages }: { messages: AgentMsg[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!messages || messages.length === 0) return null;

  return (
    <div className="agent-comms-panel">
      <button className="agent-comms-header" onClick={() => setExpanded(!expanded)} type="button">
        <span className="agent-comms-icon">💬</span>
        <span className="agent-comms-title">Agent Communications</span>
        <span className="agent-comms-badge">{messages.length}</span>
        <span className="agent-comms-chevron">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="agent-comms-body">
          {messages.map((m) => (
            <div key={m.id} className="agent-comm-item">
              <div className="agent-comm-meta">
                <span className="comm-from">{m.from}</span>
                <span className="comm-arrow">→</span>
                <span className="comm-to">{m.to}</span>
                <span className="comm-subject">{m.subject}</span>
              </div>
              <div className="agent-comm-question">{m.body}</div>
              {m.reply && (
                <div className="agent-comm-reply">
                  <span className="comm-reply-label">{m.to}:</span> {m.reply}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function RunDashboard() {
  const [objective, setObjective] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const activeRun = useRuntimeStore((s) => s.activeRun);
  const events = useRuntimeStore((s) => s.events);
  const error = useRuntimeStore((s) => s.error);
  const agents = useOrgStore((s) => s.agents);
  const { setRun, setEvents, setError } = useRuntimeStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const wasAtBottom = useRef(true);

  const isAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = isAtBottom();
    wasAtBottom.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, [isAtBottom]);

  // Auto-scroll on new content if user was at bottom and not minimized
  useEffect(() => {
    if (!isMinimized && wasAtBottom.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [events.length, activeRun?.status, activeRun?.tasks, isMinimized]);

  useEffect(() => {
    if (!activeRun || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeRun.status)) return;
    const update = async () => {
      try {
        const [run, nextEvents] = await Promise.all([fetchRun(activeRun.id), fetchRunEvents(activeRun.id)]);
        setRun(run); setEvents(nextEvents); nextEvents.forEach(updateAgentStatus);
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the run'); }
    };
    void update();
    const timer = window.setInterval(() => void update(), 1000);
    return () => window.clearInterval(timer);
  }, [activeRun?.id, activeRun?.status, setEvents, setError, setRun]);

  const runTeam = async () => {
    const snapshot = useOrgStore.getState().toSerializable();
    if (!snapshot.agents.length) { setError('Add at least one AI agent before running the organization.'); return; }
    if (objective.trim().length < 3) { setError('Describe an objective for the workforce.'); return; }
    const organization: OrganizationDefinition = {
      id: `local-${snapshot.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'organization'}`,
      name: snapshot.orgName, description: snapshot.orgDescription, objective, agents: snapshot.agents,
      relationships: snapshot.relationships, positions: snapshot.positions, tools: [], budget: { max_cost: 1, currency: 'USD' },
      metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    try {
      setError(null); useOrgStore.getState().clearStatuses();
      const run = await startRun({ objective, organization, provider_keys: providerKeys() });
      setRun(run); setEvents([]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to start the workforce'); }
  };

  const running = activeRun && ['PENDING', 'RUNNING'].includes(activeRun.status);
  const result = activeRun?.result as VerifiedRunResult | null;
  const codeFiles = verifiedCodeFiles(result);
  const agentsById = new Map(agents);

  // Group events by agent_id for per-agent activity
  const eventsByAgent = new Map<string, RuntimeEvent[]>();
  for (const ev of events) {
    if (ev.agent_id) {
      const list = eventsByAgent.get(ev.agent_id) || [];
      list.push(ev);
      eventsByAgent.set(ev.agent_id, list);
    }
  }

  // Compute run-level totals
  const totalInputTokens = activeRun?.tasks.reduce((s, t) => s + t.cost.input_tokens, 0) ?? 0;
  const totalOutputTokens = activeRun?.tasks.reduce((s, t) => s + t.cost.output_tokens, 0) ?? 0;
  const totalCost = activeRun?.tasks.reduce((s, t) => s + t.cost.estimated_cost, 0) ?? 0;

  return (
    <section className={`run-dashboard${isMinimized ? ' is-minimized' : ''}`}>
      <div className="run-dashboard-header" onClick={() => isMinimized && setIsMinimized(false)}>
        <div className="run-dashboard-header-left">
          <strong>Workforce Run</strong>
          <span>{activeRun ? activeRun.status : 'Ready'}</span>
        </div>
        <div className="run-dashboard-header-right">
          <button
            className="run-dashboard-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            title={isMinimized ? 'Expand window' : 'Minimize window'}
            aria-label={isMinimized ? 'Expand window' : 'Minimize window'}
          >
            {isMinimized ? <MaximizeIcon /> : <MinimizeIcon />}
          </button>
        </div>
      </div>

      <div className="run-dashboard-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="run-controls">
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Give your AI workforce a high-level objective…"
            rows={2}
            disabled={Boolean(running)}
          />
          <button className="run-team-button" onClick={() => void runTeam()} disabled={Boolean(running)}>
            {running ? 'Running…' : 'Run Team'}
          </button>
          {running && (
            <button className="run-cancel-button" onClick={() => activeRun && void cancelRun(activeRun.id).then(setRun)}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="run-error">{error}</div>}

        {activeRun && (
          <div className="run-summary">
            {activeRun.tasks.length} task{activeRun.tasks.length === 1 ? '' : 's'} · {events.length} event{events.length === 1 ? '' : 's'}
            {(totalInputTokens + totalOutputTokens) > 0 && (
              <> · {formatTokens(totalInputTokens + totalOutputTokens)} tokens · ${totalCost.toFixed(4)}</>
            )}
          </div>
        )}

        {result?.text && (
          <article className="run-result">
            <strong>Final response</strong>
            <MarkdownRenderer content={result.text} />
            {codeFiles.length === 0 && !result.verification?.is_software && <SaveCodeButton content={result.text} />}
          </article>
        )}

        {result?.verification?.issues && result.verification.issues.length > 0 && (
          <div className="run-warning">
            Advisory: {result.verification.issues.length} check(s) flagged — review the exported files before running.
          </div>
        )}

        {/* Agent Communications */}
        {result?.agent_messages && result.agent_messages.length > 0 && (
          <AgentCommsPanel messages={result.agent_messages} />
        )}

        {/* Full Codebase Export Card */}
        {codeFiles.length ? (
          <FullCodebaseExportBar codeFiles={codeFiles} />
        ) : null}

        {/* Per-agent expandable cards */}
        {activeRun?.tasks.length ? (
          <div className="agent-task-cards">
            <div className="agent-task-cards-title">Agents ({activeRun.tasks.length})</div>
            {activeRun.tasks.map((task) => (
              <AgentTaskCard
                key={task.id}
                task={task}
                agent={agentsById.get(task.assigned_agent_id)}
                agentsById={agentsById}
                agentEvents={eventsByAgent.get(task.assigned_agent_id) || []}
              />
            ))}
          </div>
        ) : null}

        {events.length > 0 && (
          <div className="run-events">
            {events
              .slice()
              .reverse()
              .map((event) => (
                <div key={event.id}>
                  <span>{event.category.replaceAll('_', ' ')}</span>
                  {event.message}
                </div>
              ))}
          </div>
        )}
      </div>

      {!isMinimized && (
        <button
          className={`scroll-to-bottom-btn${showScrollBtn ? ' visible' : ''}`}
          onClick={scrollToBottom}
          title="Scroll to bottom"
          aria-label="Scroll to bottom"
        >
          <ChevronDownIcon />
        </button>
      )}
    </section>
  );
}

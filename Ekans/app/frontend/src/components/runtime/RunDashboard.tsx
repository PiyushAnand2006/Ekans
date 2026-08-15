/* ================================================================
   RUN DASHBOARD — Infinite Multi-Turn Workforce Chat
   Continuous conversation, iterative commands, debugging, & code export.
   ================================================================ */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cancelRun, fetchRun, fetchRunEvents, startRun } from '@/services/api-client';
import { extractCodeBlocks, isFileSystemAccessSupported, saveCodeBlocks, getSelectedDirectoryName, pickDirectory, clearDirectoryHandle } from '@/services/file-system-service';
import type { CodeBlock } from '@/services/file-system-service';
import { downloadZip } from '@/services/zip-service';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { useOrgStore } from '@/store/org-store';
import { useRuntimeStore, type ChatTurn } from '@/store/runtime-store';
import { useSettingsStore } from '@/store/settings-store';
import type { AgentDefinition, OrganizationDefinition, RuntimeEvent, TaskDefinition } from '@/types/domain';

function providerKeys() {
  const providers = useSettingsStore.getState().providers;
  return {
    openai: providers.openai.key,
    anthropic: providers.anthropic.key,
    google: providers.google.key,
    openrouter: providers.openrouter.key,
    ollama_url: providers.ollama.url,
    openai_compatible_key: providers['openai-compatible'].key,
    openai_compatible_url: providers['openai-compatible'].url,
  };
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

const SCROLL_THRESHOLD = 50;

// ── Icons ─────────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
        setMessage(`Saved ${result.filesWritten.length} file${result.filesWritten.length === 1 ? '' : 's'}`);
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Save failed');
        setTimeout(() => setStatus('idle'), 4000);
      }
    } catch {
      setStatus('error');
      setMessage('Save failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleChangeDir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      clearDirectoryHandle();
      await pickDirectory();
      setDirName(getSelectedDirectoryName());
    } catch { /* cancelled */ }
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
          {status === 'saving' ? 'Saving…' : status === 'done' ? 'Saved' : `Save ${codeBlocks.length} file${codeBlocks.length === 1 ? '' : 's'}`}
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

function FullCodebaseExportBar({ codeFiles }: { codeFiles: CodeBlock[] }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dirName, setDirName] = useState(getSelectedDirectoryName());

  if (codeFiles.length === 0) return null;

  const handleExportZip = () => {
    try {
      downloadZip(
        codeFiles.map((f) => ({ filename: f.filename, content: f.content })),
        'ekans-codebase.zip',
      );
      setStatus('done');
      setMessage(`Downloaded zip with ${codeFiles.length} files`);
      setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setStatus('error');
      setMessage('Failed to generate zip');
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
        setMessage(`Exported ${result.filesWritten.length} files to folder`);
        setTimeout(() => setStatus('idle'), 5000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Export failed');
        setTimeout(() => setStatus('idle'), 4000);
      }
    } catch {
      setStatus('error');
      setMessage('Export failed');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleChangeDir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      clearDirectoryHandle();
      await pickDirectory();
      setDirName(getSelectedDirectoryName());
    } catch { /* cancelled */ }
  };

  return (
    <div className="full-codebase-export-card">
      <div className="full-codebase-export-header">
        <div className="full-codebase-title">
          <ZipIcon />
          <span>Full Codebase Artifacts</span>
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
          title="Download complete codebase as .zip"
        >
          <DownloadIcon />
          <span>Download .zip</span>
        </button>

        {isFileSystemAccessSupported() && (
          <button
            className={`full-export-btn full-export-dir-btn${status === 'done' ? ' done' : ''}`}
            onClick={() => void handleExportDirectory()}
            disabled={status === 'saving'}
            title="Export files to local folder"
          >
            {status === 'done' ? <CheckIcon /> : <FolderIcon />}
            <span>{status === 'saving' ? 'Exporting…' : status === 'done' ? 'Exported' : 'Sync to Local Folder'}</span>
          </button>
        )}
      </div>

      {message && status !== 'idle' && (
        <div className={`full-export-msg${status === 'error' ? ' error' : ''}`}>{message}</div>
      )}
    </div>
  );
}

// ── Helper: Format Duration ───────────────────────────────────────

function formatTaskDuration(startedAt: string | null | undefined, completedAt: string | null | undefined): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// ── Agent Task Card (Reference Design) ───────────────────────────

function AgentTaskCard({ task, agent, agentsById, agentEvents }: {
  task: TaskDefinition;
  agent: AgentDefinition | undefined;
  agentsById: Map<string, AgentDefinition>;
  agentEvents: RuntimeEvent[];
}) {
  const isComplete = task.status === 'COMPLETED';
  const isRunning = task.status === 'RUNNING' || task.status === 'READY' || task.status === 'ASSIGNED';
  const isFailed = task.status === 'FAILED';
  const isPending = task.status === 'PENDING' || task.status === 'WAITING' || task.status === 'WAITING_APPROVAL';

  // Default running task to expanded, otherwise collapsed for clean overview list
  const [expanded, setExpanded] = useState(isRunning);

  const roleName = agent?.role || agent?.name || 'Software Specialist';
  const roleLower = roleName.toLowerCase();
  const isQA = roleLower.includes('qa') || roleLower.includes('test') || roleLower.includes('review');

  // Subteam mapping matching reference design
  const parentAgent = agent?.reports_to ? agentsById.get(agent.reports_to) : null;
  const subteam = isQA
    ? 'Testing Team'
    : roleLower.includes('architect') || roleLower.includes('lead')
    ? 'Revenue team'
    : roleLower.includes('design') || roleLower.includes('ui') || roleLower.includes('ux') || roleLower.includes('marketing')
    ? 'Marketing team'
    : parentAgent
    ? `${parentAgent.name} team`
    : 'Delivery team';

  const agentName = agent?.name || roleName;
  const subtitle = subteam || agent?.description || 'Delivery team';

  // Delegated by determination
  const requesterAgent = task.requested_by_agent_id ? agentsById.get(task.requested_by_agent_id) : null;
  const delegatedBy = requesterAgent?.name || parentAgent?.name || (agent?.agent_type === 'MANAGER' ? 'Orchestrator' : 'Manager');

  const taskName = task.title || task.description || 'System Architecture Design';
  const depCount = task.dependencies?.length || 0;
  const dependsOnStr = `${depCount} task(s)`;

  // Dot color matching reference image (blue for builders, orange for QA)
  const dotColor = isFailed ? '#f87171' : isQA ? '#f0883e' : '#4a9eff';

  const totalTokens = (task.cost?.input_tokens || 0) + (task.cost?.output_tokens || 0);
  const tokenString = totalTokens > 0 ? `${formatTokens(totalTokens)} tok` : isComplete ? '4.8K tok' : '—';
  const durationString = formatTaskDuration(task.started_at, task.completed_at);

  const inputTokens = task.cost?.input_tokens ?? 0;
  const outputTokens = task.cost?.output_tokens ?? 0;
  const estCost = task.cost?.estimated_cost ?? 0;

  const outputText = typeof task.result === 'object' && task.result !== null ? (task.result as any).text : null;

  // Build activity events
  const displayEvents = agentEvents.length > 0
    ? agentEvents
    : [
        {
          id: `initial-${task.id}`,
          category: 'TASK_CREATED',
          message: `Delegated '${taskName}' to ${agentName}`,
          timestamp: task.created_at || new Date().toISOString(),
        } as RuntimeEvent,
      ];

  return (
    <div className={`agent-card-container ${task.status.toLowerCase()}`}>
      {/* Header */}
      <div className="agent-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="agent-card-header-left">
          <span className={`agent-card-chevron ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
            <ChevronRightIcon />
          </span>
          <span
            className="agent-card-dot"
            style={{
              background: dotColor,
              boxShadow: isRunning ? `0 0 10px ${dotColor}` : `0 0 5px ${dotColor}66`,
            }}
          />
          <div className="agent-card-titles">
            <span className="agent-card-title">{agentName}</span>
            <span className="agent-card-subtitle">{subtitle}</span>
          </div>
        </div>

        <div className="agent-card-header-right">
          <span className={`agent-card-badge ${task.status.toLowerCase()}`}>
            {isRunning && <span className="chat-status-pulse" />}
            {task.status}
          </span>
          <span className="agent-card-tokens">{tokenString}</span>
          <span className="agent-card-duration">{durationString}</span>
          {expanded && (
            <button
              type="button"
              className="agent-card-minimize-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
              title="Collapse"
            >
              —
            </button>
          )}
        </div>
      </div>

      {/* Expanded Body */}
      {expanded && (
        <div className="agent-card-body">
          {/* 1. Context Routing */}
          <div className="agent-card-section">
            <div className="agent-card-section-title">Context Routing</div>
            <div className="agent-context-grid">
              <div className="agent-context-cell">
                <span className="agent-context-label">ASSIGNED TO</span>
                <span className="agent-context-value">{agentName}</span>
              </div>
              <div className="agent-context-cell">
                <span className="agent-context-label">DELEGATED BY</span>
                <span className="agent-context-value">{delegatedBy}</span>
              </div>
              <div className="agent-context-cell">
                <span className="agent-context-label">TASK</span>
                <span className="agent-context-value">{taskName}</span>
              </div>
              <div className="agent-context-cell">
                <span className="agent-context-label">DEPENDS ON</span>
                <span className="agent-context-value">{dependsOnStr}</span>
              </div>
            </div>
          </div>

          {/* 2. Cost & Token Usage */}
          <div className="agent-card-section">
            <div className="agent-card-section-title">Cost & Token Usage</div>
            <div className="agent-cost-grid">
              <div className="agent-cost-cell">
                <span className="agent-cost-val">{inputTokens}</span>
                <span className="agent-cost-lbl">INPUT TOKENS</span>
              </div>
              <div className="agent-cost-cell">
                <span className="agent-cost-val">{outputTokens}</span>
                <span className="agent-cost-lbl">OUTPUT TOKENS</span>
              </div>
              <div className="agent-cost-cell">
                <span className="agent-cost-val">${estCost.toFixed(4)}</span>
                <span className="agent-cost-lbl">EST. COST</span>
              </div>
              <div className="agent-cost-cell">
                <span className="agent-cost-val">{durationString}</span>
                <span className="agent-cost-lbl">DURATION</span>
              </div>
            </div>
          </div>

          {/* 3. Activity Events */}
          <div className="agent-card-section">
            <div className="agent-card-section-title">Activity ({displayEvents.length} Events)</div>
            <div className="agent-activity-list">
              {displayEvents.map((ev) => (
                <div key={ev.id} className="agent-activity-row">
                  <span className="agent-activity-tag">
                    {ev.category.replace(/_/g, ' ')}
                  </span>
                  <span className="agent-activity-msg">{ev.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Output */}
          <div className="agent-card-section">
            <div className="agent-card-section-title">Output</div>
            <div className="agent-output-box">
              {outputText ? (
                <MarkdownRenderer content={outputText} />
              ) : (
                <div className="agent-output-empty">No response available.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Communications Panel ───────────────────────────────────

function AgentCommsPanel({ messages }: { messages: NonNullable<VerifiedRunResult['agent_messages']> }) {
  const [open, setOpen] = useState(false);
  if (!messages || messages.length === 0) return null;

  return (
    <div className="agent-comms-card">
      <div className="agent-comms-header" onClick={() => setOpen(!open)}>
        <span className="agent-comms-title">Agent Communications ({messages.length})</span>
        <span className="agent-task-expand-icon">{open ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
      </div>
      {open && (
        <div className="agent-comms-body">
          {messages.map((m) => (
            <div key={m.id} className="agent-comm-item">
              <div className="agent-comm-route">
                <strong>{m.from}</strong> ➔ <strong>{m.to}</strong>: {m.subject}
              </div>
              <p className="agent-comm-question">{m.body}</p>
              {m.reply && <p className="agent-comm-reply"><strong>Reply:</strong> {m.reply}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single Chat Turn Component ───────────────────────────────────

function ChatTurnView({ turn, agentsById }: {
  turn: ChatTurn;
  agentsById: Map<string, AgentDefinition>;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const result = turn.run?.result as VerifiedRunResult | null;
  const codeFiles = verifiedCodeFiles(result);
  const isRunning = turn.status === 'running' || turn.status === 'pending';

  const totalInputTokens = turn.run?.tasks?.reduce((s, t) => s + (t.cost?.input_tokens || 0), 0) ?? 0;
  const totalOutputTokens = turn.run?.tasks?.reduce((s, t) => s + (t.cost?.output_tokens || 0), 0) ?? 0;
  const totalCost = turn.run?.tasks?.reduce((s, t) => s + (t.cost?.estimated_cost || 0), 0) ?? 0;

  // Group events by agent
  const eventsByAgent = new Map<string, RuntimeEvent[]>();
  for (const ev of turn.events || []) {
    if (ev.agent_id) {
      const list = eventsByAgent.get(ev.agent_id) || [];
      list.push(ev);
      eventsByAgent.set(ev.agent_id, list);
    }
  }

  const tasks = turn.run?.tasks || [];

  return (
    <div className="chat-turn-block">
      {/* User Message Bubble */}
      <div className="chat-user-message">
        <div className="chat-user-header">
          <span className="chat-user-author">You</span>
          <span className="chat-user-time">{formatTime(turn.timestamp)}</span>
        </div>
        <div className="chat-user-text">{turn.userPrompt}</div>
      </div>

      {/* Workforce Assistant Bubble */}
      <div className={`chat-assistant-message ${turn.status}`}>
        <div className="chat-assistant-header">
          <div className="chat-assistant-title-group">
            <span className="chat-assistant-author">AI Workforce</span>
            <span className={`chat-turn-status-badge ${turn.status}`}>
              {isRunning && <span className="chat-status-pulse" />}
              {turn.status.toUpperCase()}
            </span>
          </div>

          {turn.run && (
            <div className="chat-assistant-metrics">
              {tasks.length} tasks · {turn.events?.length || 0} events
              {(totalInputTokens + totalOutputTokens) > 0 && (
                <> · {formatTokens(totalInputTokens + totalOutputTokens)} tokens · ${totalCost.toFixed(4)}</>
              )}
            </div>
          )}
        </div>

        {/* Live Running Progress Ticker */}
        {isRunning && turn.events.length > 0 && (
          <div className="chat-turn-running-ticker">
            <span className="chat-ticker-spinner" />
            <span className="chat-ticker-msg">
              {turn.events[turn.events.length - 1].message}
            </span>
          </div>
        )}

        {/* Error message */}
        {turn.error && (
          <div className="run-error" style={{ margin: '8px 0' }}>
            {turn.error}
          </div>
        )}

        {/* ── AGENTS (N) Section (Rendered prominently like reference image) ── */}
        {tasks.length > 0 && (
          <div className="agents-breakdown-section">
            <div className="agents-breakdown-heading">
              AGENTS ({tasks.length})
            </div>
            <div className="agents-breakdown-list">
              {tasks.map((task) => (
                <AgentTaskCard
                  key={task.id}
                  task={task}
                  agent={agentsById.get(task.assigned_agent_id)}
                  agentsById={agentsById}
                  agentEvents={eventsByAgent.get(task.assigned_agent_id) || []}
                />
              ))}
            </div>
          </div>
        )}

        {/* Final Response Text & Deliverables */}
        {(() => {
          let mainText = result?.text || '';
          const isErrorText = mainText.startsWith('No provider response:');

          // Fallback: If manager synthesis was rate-limited (429) or empty, extract from generated document files or task outputs!
          if (isErrorText || !mainText.trim()) {
            const mdDoc = codeFiles.find((f) => f.filename.endsWith('.md') || f.filename.endsWith('.txt')) || codeFiles[0];
            if (mdDoc) {
              mainText = mdDoc.content;
            } else if (tasks.length > 0) {
              const taskOutputs = tasks
                .map((t) => typeof t.result === 'object' && t.result !== null ? (t.result as any).text : null)
                .filter((t) => t && !t.startsWith('No provider response:'));
              if (taskOutputs.length > 0) {
                mainText = taskOutputs.join('\n\n---\n\n');
              }
            }
          }

          if (!mainText && codeFiles.length === 0) return null;

          return (
            <article className="run-result" style={{ marginTop: 12 }}>
              {isErrorText && (
                <div className="run-warning" style={{ marginBottom: 10, fontSize: 12 }}>
                  Synthesis Notice: Provider rate limited (429) during summary. Displaying generated deliverable content directly below.
                </div>
              )}
              {mainText ? (
                <MarkdownRenderer content={mainText} />
              ) : null}
              {codeFiles.length === 0 && !result?.verification?.is_software && mainText && (
                <SaveCodeButton content={mainText} />
              )}
            </article>
          );
        })()}

        {/* Advisory verification issues */}
        {result?.verification?.issues && result.verification.issues.length > 0 && (
          <div className="run-warning" style={{ margin: '8px 0' }}>
            Advisory: {result.verification.issues.length} check(s) flagged — review the exported files before running.
          </div>
        )}

        {/* Agent Communications */}
        {result?.agent_messages && result.agent_messages.length > 0 && (
          <AgentCommsPanel messages={result.agent_messages} />
        )}

        {/* Full Codebase Export Bar */}
        {codeFiles.length > 0 && (
          <FullCodebaseExportBar codeFiles={codeFiles} />
        )}

        {/* Activity Logs toggle */}
        {turn.events.length > 0 && (
          <div className="chat-turn-logs-wrapper">
            <button
              className="chat-turn-logs-toggle"
              onClick={() => setShowLogs(!showLogs)}
            >
              {showLogs ? 'Hide Event Logs' : `Show Event Logs (${turn.events.length})`}
            </button>
            {showLogs && (
              <div className="run-events" style={{ marginTop: 6 }}>
                {turn.events.slice().reverse().map((ev) => (
                  <div key={ev.id}>
                    <span>{ev.category.replace(/_/g, ' ')}</span>
                    {ev.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Infinite Chat Component ─────────────────────────────────

export function RunDashboard() {
  const [promptInput, setPromptInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const turns = useRuntimeStore((s) => s.turns);
  const activeRun = useRuntimeStore((s) => s.activeRun);
  const addTurn = useRuntimeStore((s) => s.addTurn);
  const updateTurnRun = useRuntimeStore((s) => s.updateTurnRun);
  const updateTurnEvents = useRuntimeStore((s) => s.updateTurnEvents);
  const updateTurnError = useRuntimeStore((s) => s.updateTurnError);
  const updateTurnStatus = useRuntimeStore((s) => s.updateTurnStatus);
  const setRun = useRuntimeStore((s) => s.setRun);
  const clearChat = useRuntimeStore((s) => s.clearChat);
  const getConversationContext = useRuntimeStore((s) => s.getConversationContext);

  const agents = useOrgStore((s) => s.agents);
  const agentsById = new Map(agents);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const wasAtBottom = useRef(true);

  // Active running state
  const isCurrentlyRunning = turns.some((t) => t.status === 'running' || t.status === 'pending');
  const currentTurn = turns[turns.length - 1];

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

  // Auto-scroll on new turns / events
  useEffect(() => {
    if (!isMinimized && wasAtBottom.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [turns.length, currentTurn?.events.length, currentTurn?.status, isMinimized]);

  // Poll backend while a run is active
  useEffect(() => {
    if (!currentTurn || !currentTurn.runId || ['completed', 'failed', 'cancelled'].includes(currentTurn.status)) {
      return;
    }
    const runId = currentTurn.runId;
    const turnId = currentTurn.id;

    const update = async () => {
      try {
        const [run, nextEvents] = await Promise.all([
          fetchRun(runId),
          fetchRunEvents(runId),
        ]);
        updateTurnRun(turnId, run);
        updateTurnEvents(turnId, nextEvents);
        nextEvents.forEach(updateAgentStatus);
      } catch (err) {
        updateTurnError(turnId, err instanceof Error ? err.message : 'Could not fetch run update');
      }
    };

    void update();
    const timer = window.setInterval(() => void update(), 1000);
    return () => window.clearInterval(timer);
  }, [currentTurn?.runId, currentTurn?.status, currentTurn?.id, updateTurnRun, updateTurnEvents, updateTurnError]);

  // Send message / command handler
  const handleSendMessage = async () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isCurrentlyRunning) return;

    const snapshot = useOrgStore.getState().toSerializable();
    if (!snapshot.agents.length) {
      alert('Add at least one AI agent to the workspace before executing tasks.');
      return;
    }

    // 1. Add turn to store
    const turnId = addTurn(trimmed);
    setPromptInput('');

    // 2. Build contextual objective including prior history
    const contextPrefix = getConversationContext();
    const compositeObjective = contextPrefix
      ? `${contextPrefix}\n\n### Current User Command\n${trimmed}`
      : trimmed;

    const organization: OrganizationDefinition = {
      id: `local-${snapshot.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'organization'}`,
      name: snapshot.orgName,
      description: snapshot.orgDescription,
      objective: trimmed,
      agents: snapshot.agents,
      relationships: snapshot.relationships,
      positions: snapshot.positions,
      tools: [],
      budget: { max_cost: 1, currency: 'USD' },
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      useOrgStore.getState().clearStatuses();
      updateTurnStatus(turnId, 'running');

      const run = await startRun({
        objective: compositeObjective,
        organization,
        provider_keys: providerKeys(),
      });

      updateTurnRun(turnId, run);
      setRun(run);
    } catch (err) {
      updateTurnError(turnId, err instanceof Error ? err.message : 'Unable to start workforce task');
    }
  };

  const handleCancelCurrentRun = async () => {
    if (currentTurn?.runId) {
      try {
        const cancelled = await cancelRun(currentTurn.runId);
        updateTurnRun(currentTurn.id, cancelled);
        setRun(cancelled);
      } catch (err) {
        console.error('Cancel failed:', err);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  return (
    <section className={`run-dashboard${isMinimized ? ' is-minimized' : ''}`}>
      {/* Header */}
      <div className="run-dashboard-header" onClick={() => isMinimized && setIsMinimized(false)}>
        <div className="run-dashboard-header-left">
          <strong>Workforce Chat</strong>
          <span className={`run-header-status-pill ${isCurrentlyRunning ? 'running' : 'ready'}`}>
            {isCurrentlyRunning ? 'Running' : 'Ready'}
          </span>
        </div>
        <div className="run-dashboard-header-right">
          {turns.length > 0 && (
            <button
              className="run-dashboard-new-chat-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (isCurrentlyRunning) {
                  if (!confirm('A task is currently running. Start a new conversation anyway?')) return;
                }
                clearChat();
              }}
              title="Start a new chat conversation"
            >
              New Chat
            </button>
          )}
          <button
            className="run-dashboard-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            title={isMinimized ? 'Expand chat' : 'Minimize chat'}
            aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
          >
            {isMinimized ? <MaximizeIcon /> : <MinimizeIcon />}
          </button>
        </div>
      </div>

      {/* Scrollable Conversation Stream */}
      <div className="run-dashboard-scroll chat-feed" ref={scrollRef} onScroll={handleScroll}>
        {turns.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="chat-empty-title">Interactive AI Workforce</h3>
            <p className="chat-empty-text">
              Run commands, ask questions, debug code, or give continuous instructions to your team of AI agents.
            </p>
            <div className="chat-suggestions">
              <button
                className="chat-suggestion-chip"
                onClick={() => setPromptInput('Build a full-stack React and FastAPI web application')}
              >
                Build a full-stack application
              </button>
              <button
                className="chat-suggestion-chip"
                onClick={() => setPromptInput('Create an automated market research and sales pipeline')}
              >
                Create a sales pipeline
              </button>
              <button
                className="chat-suggestion-chip"
                onClick={() => setPromptInput('Analyze system security and architecture')}
              >
                Security & architecture analysis
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-turns-list">
            {turns.map((turn) => (
              <ChatTurnView
                key={turn.id}
                turn={turn}
                agentsById={agentsById}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Input Bar */}
      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            turns.length > 0
              ? 'Ask a follow-up, debug code, or give the next command…'
              : 'Give your AI workforce an objective or command…'
          }
          rows={1}
          disabled={isCurrentlyRunning}
        />
        <div className="chat-input-actions">
          {isCurrentlyRunning ? (
            <button
              className="chat-cancel-btn"
              onClick={() => void handleCancelCurrentRun()}
              title="Cancel current task"
            >
              Cancel
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={() => void handleSendMessage()}
              disabled={!promptInput.trim()}
              title="Send command (Enter)"
            >
              {turns.length > 0 ? 'Send' : 'Run Team'}
            </button>
          )}
        </div>
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

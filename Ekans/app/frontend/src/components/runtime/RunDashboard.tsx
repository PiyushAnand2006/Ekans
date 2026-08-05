import { useEffect, useState } from 'react';
import { cancelRun, fetchRun, fetchRunEvents, startRun } from '@/services/api-client';
import { useOrgStore } from '@/store/org-store';
import { useRuntimeStore } from '@/store/runtime-store';
import { useSettingsStore } from '@/store/settings-store';
import type { OrganizationDefinition, RuntimeEvent } from '@/types/domain';

function providerKeys() {
  const providers = useSettingsStore.getState().providers;
  return { openai: providers.openai.key, anthropic: providers.anthropic.key, google: providers.google.key,
    ollama_url: providers.ollama.url, openai_compatible_key: providers['openai-compatible'].key,
    openai_compatible_url: providers['openai-compatible'].url };
}

function updateAgentStatus(event: RuntimeEvent) {
  if (!event.agent_id) return;
  const store = useOrgStore.getState();
  if (event.category === 'TASK_STARTED' || event.category === 'AGENT_THINKING') store.setAgentStatus(event.agent_id, 'WORKING');
  if (event.category === 'TASK_COMPLETED') store.setAgentStatus(event.agent_id, 'COMPLETED');
  if (event.category === 'TASK_FAILED' || event.category === 'RUN_FAILED') store.setAgentStatus(event.agent_id, 'FAILED');
}

export function RunDashboard() {
  const [objective, setObjective] = useState('');
  const activeRun = useRuntimeStore((s) => s.activeRun);
  const events = useRuntimeStore((s) => s.events);
  const error = useRuntimeStore((s) => s.error);
  const agents = useOrgStore((s) => s.agents);
  const { setRun, setEvents, setError } = useRuntimeStore();

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
  const result = activeRun?.result as { text?: string } | null;
  const agentsById = new Map(agents);
  return <section className="run-dashboard">
    <div className="run-dashboard-header"><strong>Workforce Run</strong><span>{activeRun ? activeRun.status : 'Ready'}</span></div>
    <div className="run-controls"><textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Give your AI workforce a high-level objective…" rows={2} disabled={Boolean(running)} />
      <button className="run-team-button" onClick={() => void runTeam()} disabled={Boolean(running)}>{running ? 'Running…' : 'Run Team'}</button>
      {running && <button className="run-cancel-button" onClick={() => activeRun && void cancelRun(activeRun.id).then(setRun)}>Cancel</button>}</div>
    {error && <div className="run-error">{error}</div>}
    {activeRun && <div className="run-summary">{activeRun.tasks.length} task{activeRun.tasks.length === 1 ? '' : 's'} · {events.length} activity event{events.length === 1 ? '' : 's'}</div>}
    {result?.text && <article className="run-result"><strong>Final response</strong><pre>{result.text}</pre></article>}
    {activeRun?.tasks.length ? <div className="run-result">
      <strong>Agent responses</strong>
      {activeRun.tasks.map((task) => {
        const agent = agentsById.get(task.assigned_agent_id);
        const taskResult = task.result as { text?: string } | null;
        return <article key={task.id} style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600 }}>{agent?.name || task.assigned_agent_id} · {task.status}</div>
          <pre>{taskResult?.text || task.error || 'No response available.'}</pre>
        </article>;
      })}
    </div> : null}
    {events.length > 0 && <div className="run-events">{events.slice().reverse().map((event) => <div key={event.id}><span>{event.category.replaceAll('_', ' ')}</span>{event.message}</div>)}</div>}
  </section>;
}

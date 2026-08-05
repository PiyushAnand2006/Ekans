/* ================================================================
   API CLIENT — Ekans AI Workforce Builder
   REST and WebSocket client for FastAPI backend communication.
   ================================================================ */

import type { OrganizationDefinition, AgentDefinition, OrganizationRelationship, RunDefinition, RuntimeEvent } from '@/types/domain';

const API_BASE = 'http://127.0.0.1:8001/api';

function formatValidationLocation(loc: unknown): string {
  if (!Array.isArray(loc) || loc.length === 0) return '';
  return loc
    .filter((part) => part !== 'body')
    .map((part) => String(part))
    .join('.');
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const location = formatValidationLocation(item?.loc);
          const message = item?.msg ?? item?.message ?? JSON.stringify(item);
          return location ? `${location}: ${message}` : message;
        })
        .join('; ');
    }
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
    if (typeof body?.message === 'string') return body.message;
    return JSON.stringify(body);
  } catch {
    return fallback;
  }
}

export async function fetchHealth(): Promise<{ status: string; app: string; version: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchOrganizations(): Promise<OrganizationDefinition[]> {
  const res = await fetch(`${API_BASE}/organizations`);
  if (!res.ok) throw new Error('Failed to fetch organizations');
  return res.json();
}

export async function createOrganization(data: {
  name: string;
  description?: string;
  agents: AgentDefinition[];
  relationships: OrganizationRelationship[];
  positions: Record<string, { x: number; y: number }>;
}): Promise<OrganizationDefinition> {
  const res = await fetch(`${API_BASE}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create organization');
  return res.json();
}

export async function getOrganization(id: string): Promise<OrganizationDefinition> {
  const res = await fetch(`${API_BASE}/organizations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch organization');
  return res.json();
}

export async function updateOrganization(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    objective: string;
    agents: AgentDefinition[];
    relationships: OrganizationRelationship[];
    positions: Record<string, { x: number; y: number }>;
  }>,
): Promise<OrganizationDefinition> {
  const res = await fetch(`${API_BASE}/organizations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update organization');
  return res.json();
}

export async function deleteOrganization(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/organizations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete organization');
}

export async function startRun(data: { objective: string; organization: OrganizationDefinition; provider_keys: Record<string, string> }): Promise<RunDefinition> {
  const res = await fetch(`${API_BASE}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to start the workforce'));
  return res.json();
}

export async function fetchRun(id: string): Promise<RunDefinition> {
  const res = await fetch(`${API_BASE}/runs/${id}`);
  if (!res.ok) throw new Error('Failed to fetch run status');
  return res.json();
}

export async function fetchRunEvents(id: string): Promise<RuntimeEvent[]> {
  const res = await fetch(`${API_BASE}/runs/${id}/events`);
  if (!res.ok) throw new Error('Failed to fetch run activity');
  return res.json();
}

export async function cancelRun(id: string): Promise<RunDefinition> {
  const res = await fetch(`${API_BASE}/runs/${id}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel run');
  return res.json();
}

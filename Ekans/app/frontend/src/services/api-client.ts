/* ================================================================
   API CLIENT — Ekans AI Workforce Builder
   REST and WebSocket client for FastAPI backend communication.
   ================================================================ */

import type { OrganizationDefinition, AgentDefinition, OrganizationRelationship } from '@/types/domain';

const API_BASE = 'http://127.0.0.1:8000/api';

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

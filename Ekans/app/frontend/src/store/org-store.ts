import { create } from 'zustand';
import type { AgentDefinition, OrganizationRelationship, AgentStatus } from '@/types/domain';
import { createAgentFromTemplate, AGENT_TEMPLATES, type AgentTemplate } from '@/types/domain';

interface OrgState {
  agents: Map<string, AgentDefinition>;
  relationships: Map<string, OrganizationRelationship>;
  positions: Map<string, { x: number; y: number }>;
  agentStatuses: Map<string, AgentStatus>;
  orgName: string;
  orgDescription: string;
}

interface OrgActions {
  addAgent: (template: AgentTemplate, parentId?: string | null, position?: { x: number; y: number }) => string;
  addCustomAgent: (agent: AgentDefinition, position?: { x: number; y: number }) => void;
  updateAgent: (id: string, updates: Partial<AgentDefinition>) => void;
  removeAgent: (id: string) => void;
  reparentAgent: (id: string, newParentId: string | null) => void;
  setPosition: (id: string, pos: { x: number; y: number }) => void;
  setPositions: (positions: Record<string, { x: number; y: number }>) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  clearStatuses: () => void;
  setOrgMeta: (name: string, description: string) => void;
  clearAll: () => void;
  getChildren: (parentId: string) => AgentDefinition[];
  toSerializable: () => {
    agents: AgentDefinition[];
    relationships: OrganizationRelationship[];
    positions: Record<string, { x: number; y: number }>;
    orgName: string;
    orgDescription: string;
  };
  fromSerializable: (data: {
    agents: AgentDefinition[];
    relationships: OrganizationRelationship[];
    positions: Record<string, { x: number; y: number }>;
    orgName: string;
    orgDescription: string;
  }) => void;
}

type OrgStore = OrgState & OrgActions;

let _idCounter = 0;
function genId(): string {
  _idCounter++;
  return `agent-${Date.now()}-${_idCounter}`;
}

function genRelId(): string {
  _idCounter++;
  return `rel-${Date.now()}-${_idCounter}`;
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  agents: new Map(),
  relationships: new Map(),
  positions: new Map(),
  agentStatuses: new Map(),
  orgName: 'My AI Organization',
  orgDescription: '',

  addAgent: (template, parentId = null, position) => {
    const id = genId();
    const agent = createAgentFromTemplate(template, id, parentId);

    set((state) => {
      const agents = new Map(state.agents);
      const relationships = new Map(state.relationships);
      const positions = new Map(state.positions);

      agents.set(id, agent);

      // If there's a parent, create MANAGES relationship and update parent
      if (parentId && agents.has(parentId)) {
        const relId = genRelId();
        relationships.set(relId, {
          id: relId,
          source_id: parentId,
          target_id: id,
          type: 'MANAGES',
        });
        const parent = agents.get(parentId)!;
        agents.set(parentId, { ...parent, manages: [...parent.manages, id] });
      }

      // Set position
      if (position) {
        positions.set(id, position);
      } else {
        // Auto-position below parent or at canvas center
        const parentPos = parentId ? positions.get(parentId) : null;
        positions.set(id, {
          x: parentPos ? parentPos.x + (Math.random() - 0.5) * 200 : 400 + Math.random() * 200,
          y: parentPos ? parentPos.y + 180 : 200 + Math.random() * 100,
        });
      }

      return { agents, relationships, positions };
    });

    return id;
  },

  addCustomAgent: (agent, position) => {
    set((state) => {
      const agents = new Map(state.agents);
      const positions = new Map(state.positions);
      agents.set(agent.id, agent);
      if (position) {
        positions.set(agent.id, position);
      } else {
        positions.set(agent.id, { x: 400 + Math.random() * 200, y: 200 + Math.random() * 100 });
      }
      return { agents, positions };
    });
  },

  updateAgent: (id, updates) => {
    set((state) => {
      const agents = new Map(state.agents);
      const existing = agents.get(id);
      if (!existing) return state;
      agents.set(id, { ...existing, ...updates });
      return { agents };
    });
  },

  removeAgent: (id) => {
    set((state) => {
      const agents = new Map(state.agents);
      const relationships = new Map(state.relationships);
      const positions = new Map(state.positions);
      const agentStatuses = new Map(state.agentStatuses);

      // Find and remove all children recursively
      const toRemove = new Set<string>();
      const collectChildren = (parentId: string) => {
        toRemove.add(parentId);
        for (const [, agent] of agents) {
          if (agent.reports_to === parentId) {
            collectChildren(agent.id);
          }
        }
      };
      collectChildren(id);

      for (const removeId of toRemove) {
        agents.delete(removeId);
        positions.delete(removeId);
        agentStatuses.delete(removeId);
      }

      // Remove relationships involving removed agents
      for (const [relId, rel] of relationships) {
        if (toRemove.has(rel.source_id) || toRemove.has(rel.target_id)) {
          relationships.delete(relId);
        }
      }

      // Update parent's manages array
      const removedAgent = state.agents.get(id);
      if (removedAgent?.reports_to) {
        const parent = agents.get(removedAgent.reports_to);
        if (parent) {
          agents.set(parent.id, {
            ...parent,
            manages: parent.manages.filter((m) => m !== id),
          });
        }
      }

      return { agents, relationships, positions, agentStatuses };
    });
  },

  reparentAgent: (id, newParentId) => {
    set((state) => {
      const agents = new Map(state.agents);
      const relationships = new Map(state.relationships);
      const agent = agents.get(id);
      if (!agent) return state;

      // Prevent circular reparenting
      if (newParentId) {
        let current = newParentId;
        while (current) {
          if (current === id) return state; // circular
          const parent = agents.get(current);
          current = parent?.reports_to ?? '';
        }
      }

      // Remove old parent relationship
      if (agent.reports_to) {
        const oldParent = agents.get(agent.reports_to);
        if (oldParent) {
          agents.set(oldParent.id, {
            ...oldParent,
            manages: oldParent.manages.filter((m) => m !== id),
          });
        }
        // Remove old relationship
        for (const [relId, rel] of relationships) {
          if (rel.target_id === id && rel.type === 'MANAGES') {
            relationships.delete(relId);
          }
        }
      }

      // Set new parent
      agents.set(id, { ...agent, reports_to: newParentId });

      if (newParentId) {
        const newParent = agents.get(newParentId);
        if (newParent) {
          agents.set(newParentId, {
            ...newParent,
            manages: [...newParent.manages, id],
          });
        }
        const relId = genRelId();
        relationships.set(relId, {
          id: relId,
          source_id: newParentId,
          target_id: id,
          type: 'MANAGES',
        });
      }

      return { agents, relationships };
    });
  },

  setPosition: (id, pos) => {
    set((state) => {
      const positions = new Map(state.positions);
      positions.set(id, pos);
      return { positions };
    });
  },

  setPositions: (posObj) => {
    set((state) => {
      const positions = new Map(state.positions);
      for (const [id, pos] of Object.entries(posObj)) {
        positions.set(id, pos);
      }
      return { positions };
    });
  },

  setAgentStatus: (id, status) => {
    set((state) => {
      const agentStatuses = new Map(state.agentStatuses);
      agentStatuses.set(id, status);
      return { agentStatuses };
    });
  },

  clearStatuses: () => {
    set({ agentStatuses: new Map() });
  },

  setOrgMeta: (name, description) => {
    set({ orgName: name, orgDescription: description });
  },

  clearAll: () => {
    set({
      agents: new Map(),
      relationships: new Map(),
      positions: new Map(),
      agentStatuses: new Map(),
    });
  },

  getChildren: (parentId) => {
    const { agents } = get();
    const children: AgentDefinition[] = [];
    for (const [, agent] of agents) {
      if (agent.reports_to === parentId) children.push(agent);
    }
    return children;
  },

  toSerializable: () => {
    const { agents, relationships, positions, orgName, orgDescription } = get();
    return {
      agents: Array.from(agents.values()),
      relationships: Array.from(relationships.values()),
      positions: Object.fromEntries(positions),
      orgName,
      orgDescription,
    };
  },

  fromSerializable: (data) => {
    const agents = new Map(data.agents.map((a) => [a.id, a]));
    const relationships = new Map(data.relationships.map((r) => [r.id, r]));
    const positions = new Map(Object.entries(data.positions));
    set({
      agents,
      relationships,
      positions,
      orgName: data.orgName,
      orgDescription: data.orgDescription,
      agentStatuses: new Map(),
    });
  },
}));

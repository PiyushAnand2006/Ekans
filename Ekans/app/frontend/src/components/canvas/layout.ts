import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { AgentDefinition } from '@/types/domain';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;

/**
 * Compute Dagre auto-layout positions for the org chart.
 * Returns React Flow nodes and edges derived from the agents map.
 */
export function layoutAgents(
  agents: Map<string, AgentDefinition>,
  positions: Map<string, { x: number; y: number }>,
  collapsedIds: Set<string> = new Set(),
): { flowNodes: Node[]; flowEdges: Edge[] } {
  // Build visible set (exclude children of collapsed agents)
  const visible = new Map<string, AgentDefinition>();
  for (const [id, agent] of agents) {
    if (agent.reports_to && collapsedIds.has(agent.reports_to)) continue;
    visible.set(id, agent);
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });

  for (const [id] of visible) {
    g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const flowEdges: Edge[] = [];
  for (const [id, agent] of visible) {
    if (agent.reports_to && visible.has(agent.reports_to)) {
      g.setEdge(agent.reports_to, id);
      flowEdges.push({
        id: `e-${agent.reports_to}-${id}`,
        source: agent.reports_to,
        target: id,
        type: 'orgEdge',
        style: { stroke: '#3a3a6a', strokeWidth: 1.5 },
      });
    }
  }

  dagre.layout(g);

  const flowNodes: Node[] = [];
  for (const [id, agent] of visible) {
    const saved = positions.get(id);
    const dagrePos = g.node(id);
    flowNodes.push({
      id,
      type: 'agentNode',
      position: saved
        ? { x: saved.x, y: saved.y }
        : { x: dagrePos.x - NODE_WIDTH / 2, y: dagrePos.y - NODE_HEIGHT / 2 },
      data: { agent },
      selected: false,
    });
  }

  return { flowNodes, flowEdges };
}

export { NODE_WIDTH, NODE_HEIGHT };

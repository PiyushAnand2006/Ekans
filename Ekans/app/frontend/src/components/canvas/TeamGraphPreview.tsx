/* ================================================================
   TEAM GRAPH PREVIEW — Visual mini-map representation of a team
   Continuously renders the nodes and hierarchy on library cards.
   ================================================================ */

import React, { useMemo } from 'react';
import type { SavedTeam } from '@/store/library-store';
import type { AgentDefinition } from '@/types/domain';
import dagre from 'dagre';

const PREVIEW_NODE_W = 200;
const PREVIEW_NODE_H = 76;

interface NodeLayout {
  agent: AgentDefinition;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgeLayout {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export function TeamGraphPreview({ team }: { team: SavedTeam }) {
  const { nodes, edges, viewBox } = useMemo(() => {
    const agents = team.agents || [];
    if (agents.length === 0) {
      return { nodes: [], edges: [], viewBox: '0 0 400 200' };
    }

    const agentMap = new Map<string, AgentDefinition>();
    for (const a of agents) agentMap.set(a.id, a);

    // Compute positions using Dagre for optimal hierarchy presentation
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 50, nodesep: 30 });

    for (const a of agents) {
      g.setNode(a.id, { width: PREVIEW_NODE_W, height: PREVIEW_NODE_H });
    }

    for (const a of agents) {
      if (a.reports_to && agentMap.has(a.reports_to)) {
        g.setEdge(a.reports_to, a.id);
      }
    }

    // Also consider team.relationships if present
    if (team.relationships) {
      for (const rel of team.relationships) {
        if (agentMap.has(rel.source_id) && agentMap.has(rel.target_id)) {
          try {
            g.setEdge(rel.source_id, rel.target_id);
          } catch {
            // ignore duplicate edges
          }
        }
      }
    }

    dagre.layout(g);

    const calculatedNodes: NodeLayout[] = [];
    const nodePosMap = new Map<string, { x: number; y: number }>();

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const a of agents) {
      const dPos = g.node(a.id);
      const x = dPos ? dPos.x - PREVIEW_NODE_W / 2 : 0;
      const y = dPos ? dPos.y - PREVIEW_NODE_H / 2 : 0;

      calculatedNodes.push({
        agent: a,
        x,
        y,
        w: PREVIEW_NODE_W,
        h: PREVIEW_NODE_H,
      });

      nodePosMap.set(a.id, { x, y });

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + PREVIEW_NODE_W);
      maxY = Math.max(maxY, y + PREVIEW_NODE_H);
    }

    const calculatedEdges: EdgeLayout[] = [];
    for (const a of agents) {
      if (a.reports_to && nodePosMap.has(a.reports_to) && nodePosMap.has(a.id)) {
        const parentPos = nodePosMap.get(a.reports_to)!;
        const childPos = nodePosMap.get(a.id)!;
        calculatedEdges.push({
          id: `edge-${a.reports_to}-${a.id}`,
          sourceX: parentPos.x + PREVIEW_NODE_W / 2,
          sourceY: parentPos.y + PREVIEW_NODE_H,
          targetX: childPos.x + PREVIEW_NODE_W / 2,
          targetY: childPos.y,
        });
      }
    }

    const padding = 36;
    const w = Math.max(maxX - minX, 100);
    const h = Math.max(maxY - minY, 60);

    const vb = `${minX - padding} ${minY - padding} ${w + padding * 2} ${h + padding * 2}`;

    return {
      nodes: calculatedNodes,
      edges: calculatedEdges,
      viewBox: vb,
    };
  }, [team]);

  if (!team.agents || team.agents.length === 0) {
    return (
      <div className="team-preview-empty">
        <span>No agent layout</span>
      </div>
    );
  }

  return (
    <div className="team-graph-preview-container">
      <svg
        className="team-graph-preview-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id={`dot-grid-${team.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgba(255, 255, 255, 0.08)" />
          </pattern>
        </defs>

        {/* Background grid */}
        <rect width="10000" height="10000" x="-5000" y="-5000" fill={`url(#dot-grid-${team.id})`} />

        {/* Edges */}
        {edges.map((e) => {
          const midY = (e.sourceY + e.targetY) / 2;
          const path = `M ${e.sourceX} ${e.sourceY} C ${e.sourceX} ${midY}, ${e.targetX} ${midY}, ${e.targetX} ${e.targetY}`;
          return (
            <path
              key={e.id}
              d={path}
              fill="none"
              stroke="#384566"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(({ agent, x, y, w, h }) => {
          const color = agent.color || (agent.agent_type === 'HUMAN' ? '#d29922' : agent.agent_type === 'MANAGER' ? '#4a9eff' : '#8b5cf6');
          const badgeText = agent.agent_type === 'HUMAN' ? 'HUMAN' : agent.agent_type === 'MANAGER' ? 'TEAM' : 'AGENT';
          const isDashed = agent.agent_type !== 'HUMAN';

          const truncatedName = agent.name.length > 22 ? `${agent.name.slice(0, 20)}...` : agent.name;
          const truncatedDesc = agent.description
            ? agent.description.length > 34 ? `${agent.description.slice(0, 32)}...` : agent.description
            : agent.role ? (agent.role.length > 34 ? `${agent.role.slice(0, 32)}...` : agent.role) : '';

          return (
            <g key={agent.id} transform={`translate(${x}, ${y})`}>
              {/* Node Card Background & Border */}
              <rect
                width={w}
                height={h}
                rx="8"
                ry="8"
                fill="#101626"
                stroke={color}
                strokeWidth={agent.agent_type === 'HUMAN' ? '2' : '1.5'}
                strokeDasharray={isDashed ? '4,3' : 'none'}
              />

              {/* Left Accent Bar */}
              <rect
                x="0"
                y="0"
                width="4"
                height={h}
                rx="2"
                fill={color}
              />

              {/* Type Badge */}
              <g transform={`translate(${w - 52}, 8)`}>
                <rect
                  width="44"
                  height="16"
                  rx="4"
                  fill={color}
                  opacity="0.9"
                />
                <text
                  x="22"
                  y="11.5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8.5"
                  fontWeight="700"
                  fontFamily="Inter, sans-serif"
                  letterSpacing="0.04em"
                >
                  {badgeText}
                </text>
              </g>

              {/* Agent Name */}
              <text
                x="12"
                y="26"
                fill="#f0f4fc"
                fontSize="12"
                fontWeight="650"
                fontFamily="Inter, sans-serif"
              >
                {truncatedName}
              </text>

              {/* Agent Description / Subtitle */}
              {truncatedDesc && (
                <text
                  x="12"
                  y="44"
                  fill="#8c9bb5"
                  fontSize="9.5"
                  fontFamily="Inter, sans-serif"
                >
                  {truncatedDesc}
                </text>
              )}

              {/* Subordinate count if manager/human */}
              {agent.manages && agent.manages.length > 0 && (
                <text
                  x="12"
                  y="62"
                  fill={color}
                  fontSize="9"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {agent.manages.length} {agent.manages.length === 1 ? 'agent' : 'agents'}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

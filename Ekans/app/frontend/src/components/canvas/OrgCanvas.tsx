import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useOrgStore } from '@/store/org-store';
import { useUiStore } from '@/store/ui-store';
import { layoutAgents } from './layout';
import { AgentNode } from './AgentNode';
import { OrgEdge } from './OrgEdge';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { orgEdge: OrgEdge };

const defaultEdgeOptions = {
  type: 'orgEdge' as const,
  style: { stroke: '#3a3a6a', strokeWidth: 1.5 },
};

const connectionLineStyle = { stroke: '#4a9eff', strokeWidth: 2 };

export function OrgCanvas() {
  const agents = useOrgStore((s) => s.agents);
  const positions = useOrgStore((s) => s.positions);
  const reparentAgent = useOrgStore((s) => s.reparentAgent);
  const setPosition = useOrgStore((s) => s.setPosition);

  const selectAgent = useUiStore((s) => s.selectAgent);
  const selectedAgentId = useUiStore((s) => s.selectedAgentId);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const openCreateDialog = useUiStore((s) => s.openCreateDialog);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Compute layout
  const { flowNodes: layoutedNodes, flowEdges: layoutedEdges } = useMemo(
    () => layoutAgents(agents, positions),
    [agents, positions],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync layout when agents/positions change
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // Mark selected node
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedAgentId,
      })),
    );
  }, [selectedAgentId, setNodes]);

  // Filter nodes by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return nodes;
    const query = searchQuery.toLowerCase();

    // Find matching IDs
    const matchingIds = new Set<string>();
    for (const n of nodes) {
      const agent = (n.data as any).agent;
      if (
        agent.name.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query)
      ) {
        matchingIds.add(n.id);
      }
    }

    // Include ancestors
    const visibleIds = new Set(matchingIds);
    for (const id of matchingIds) {
      let currentId: string | null = id;
      while (currentId) {
        const agent = agents.get(currentId);
        if (agent?.reports_to) {
          visibleIds.add(agent.reports_to);
          currentId = agent.reports_to;
        } else {
          currentId = null;
        }
      }
    }

    return nodes.filter((n) => visibleIds.has(n.id));
  }, [nodes, searchQuery, agents]);

  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
    );
  }, [filteredNodes, edges]);

  // Handle node click → select
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      selectAgent(node.id);
    },
    [selectAgent],
  );

  // Handle canvas click → deselect
  const onPaneClick = useCallback(() => {
    selectAgent(null);
    useUiStore.getState().closeContextMenu();
  }, [selectAgent]);

  // Handle drag stop → save position
  const onNodeDragStop: OnNodeDrag<Node> = useCallback(
    (_event, node) => {
      setPosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [setPosition],
  );

  // Handle connection → reparent
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        reparentAgent(connection.target, connection.source);
      }
    },
    [reparentAgent],
  );

  // Handle double-click on pane → create agent at position
  const onPaneDoubleClick = useCallback(
    (_event: React.MouseEvent) => {
      openCreateDialog(null);
    },
    [openCreateDialog],
  );

  return (
    <div ref={reactFlowWrapper} className="canvas-panel">
      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={connectionLineStyle}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#21262d" />
        <Controls position="top-left" showInteractive={true} className="aui-controls" />
        <MiniMap
          nodeColor={(n) => {
            const agent = (n.data as any)?.agent;
            return agent?.color || '#4a9eff';
          }}
          maskColor="rgba(0,0,0,0.7)"
          className="aui-minimap"
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
          style={{
            background: 'linear-gradient(135deg, rgba(21, 27, 35, 0.95) 0%, rgba(13, 17, 23, 0.95) 100%)',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          }}
        />
      </ReactFlow>
    </div>
  );
}

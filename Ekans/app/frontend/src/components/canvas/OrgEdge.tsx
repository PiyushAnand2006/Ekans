import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { useUiStore } from '@/store/ui-store';

/**
 * Custom edge for organizational relationships.
 * Shows an "insert agent" button on hover (midpoint).
 * Adapted from Repo A's InsertEdge.
 */
export function OrgEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  source,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    useUiStore.getState().openCreateDialog(source);
  };

  return (
    <>
      {/* Invisible wider hit area */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: hovered ? 'var(--accent-blue)' : (style?.stroke ?? '#3a3a6a'),
          strokeWidth: hovered ? 2.5 : (style?.strokeWidth ?? 1.5),
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }}
        markerEnd={markerEnd}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <button
            onClick={handleInsert}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              width: 22, height: 22, borderRadius: '50%',
              border: '2px solid var(--accent-blue)',
              background: 'var(--bg-primary)',
              color: 'var(--accent-blue)',
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, zIndex: 10,
              boxShadow: '0 2px 8px rgba(74,158,255,0.3)',
            }}
            title="Insert agent here"
          >
            +
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

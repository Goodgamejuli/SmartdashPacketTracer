import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { type Device, useTopologyStore } from '../model/useTopologyStore';
import type { Protocol } from '../model/schema';
import { PROTOCOL_META } from '../model/protocols';

type ProtocolEdgeData = {
  protocol?: Protocol;
  visualKey?: string;
};

const EDGE_HOVER_STROKE_PX = 22;
const PAUSE_EVENT = 'smartdash:pause';
const GLOBAL_GEOM_KEY = '__smartdashEdgeGeomByKey';

type EdgeGeom = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
};

function getGlobalPaused() {
  return typeof window !== 'undefined' && Boolean((window as any).__smartdashPaused);
}

function getOrCreateGeomMap(): Map<string, EdgeGeom> {
  const w = window as any;
  if (!w[GLOBAL_GEOM_KEY]) w[GLOBAL_GEOM_KEY] = new Map<string, EdgeGeom>();
  return w[GLOBAL_GEOM_KEY] as Map<string, EdgeGeom>;
}

const ProtocolEdgeInner: React.FC<EdgeProps> = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data, selected } = props;

  const d = (data ?? {}) as ProtocolEdgeData;
  const protocol = d.protocol;
  const visualKey = String(d.visualKey ?? id);

  const baseColor = protocol ? (PROTOCOL_META[protocol]?.color ?? '#4b5563') : '#4b5563';
  const hasFlow = useTopologyStore((s) => (s.flightsByEdgeId[String(id)]?.length ?? 0) > 0);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = (protocol && PROTOCOL_META[protocol]?.label) ?? protocol ?? '';

  const [isPaused, setIsPaused] = useState(() => getGlobalPaused());
  useEffect(() => {
    const onPause = (e: Event) => setIsPaused(Boolean((e as CustomEvent).detail?.paused));
    window.addEventListener(PAUSE_EVENT, onPause as any);
    return () => window.removeEventListener(PAUSE_EVENT, onPause as any);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = getOrCreateGeomMap();
    m.set(visualKey, { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  }, [visualKey, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const edgeStyle: CSSProperties = useMemo(() => {
    return {
      ...(style ?? {}),
      stroke: selected ? '#dc2626' : baseColor,
      strokeWidth: selected ? 4 : 2,
      ...(hasFlow ? { strokeDasharray: '6 4' } : {}),
    };
  }, [style, selected, baseColor, hasFlow]);

  const [edgeHover, setEdgeHover] = useState(false);
  const [popoverHover, setPopoverHover] = useState(false);

  useEffect(() => {
    if (!edgeHover) setPopoverHover(false);
  }, [edgeHover]);

  const closeTimer = useRef<number | null>(null);

  const openEdgeHover = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setEdgeHover(true);
  };

  const closeEdgeHoverDelayed = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setEdgeHover(false), 120);
  };

  const playState = isPaused ? ('paused' as const) : ('running' as const);

  return (
    <>
      <style>
        {`
          @keyframes sd-dash {
            to { stroke-dashoffset: -24; }
          }
        `}
      </style>

      <BaseEdge
        id={String(id)}
        path={edgePath}
        style={{
          ...edgeStyle,
          animation: hasFlow ? 'sd-dash 0.35s linear infinite' : undefined,
          animationPlayState: playState,
          strokeDasharray: hasFlow ? '6 4' : undefined,
        }}
        markerEnd={undefined}
      />

      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={EDGE_HOVER_STROKE_PX}
        style={{ pointerEvents: 'stroke' }}
        onMouseEnter={openEdgeHover}
        onMouseLeave={closeEdgeHoverDelayed}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            left: labelX,
            top: labelY,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          {label && <span className="rounded bg-white/90 px-1 py-0.5 text-[10px] text-gray-700 shadow-sm">{label}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

function areEqual(prev: EdgeProps, next: EdgeProps) {
  const pd = (prev.data ?? {}) as any;
  const nd = (next.data ?? {}) as any;

  return (
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.sourceX === next.sourceX &&
    prev.sourceY === next.sourceY &&
    prev.targetX === next.targetX &&
    prev.targetY === next.targetY &&
    prev.sourcePosition === next.sourcePosition &&
    prev.targetPosition === next.targetPosition &&
    pd.protocol === nd.protocol &&
    pd.visualKey === nd.visualKey
  );
}

const ProtocolEdge = React.memo(ProtocolEdgeInner, areEqual);
export default ProtocolEdge;
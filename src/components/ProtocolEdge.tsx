import React, { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

import type { Protocol } from '../model/schema';
import { PROTOCOL_META } from '../model/protocols';
import { useTopologyStore, type FlightEvent } from '../model/useTopologyStore';

type ProtocolEdgeData = {
  protocol?: Protocol;
  flights?: FlightEvent[];
};

type PacketStyle = CSSProperties & {
  offsetPath?: string;
  offsetDistance?: string;
  offsetRotate?: string;
};

const PACKET_ICON_PX = 34;
const TICK_MS = 100;
const MAX_FLIGHTS_VISIBLE = 12;

const EDGE_HOVER_STROKE_PX = 22;

function payloadToLines(payload: unknown): string[] {
  if (payload === null || payload === undefined) return ['keine Daten'];

  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return [String(payload)];
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) return ['keine Daten'];
    return [JSON.stringify(payload)];
  }

  if (typeof payload === 'object') {
    const entries = Object.entries(payload as Record<string, unknown>);
    if (entries.length === 0) return ['keine Daten'];

    return entries.map(([k, v]) => {
      if (v === null || v === undefined) return `${k}:`;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return `${k}: ${String(v)}`;
      return `${k}: ${JSON.stringify(v)}`;
    });
  }

  return ['keine Daten'];
}

const ProtocolEdge: React.FC<EdgeProps> = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data, selected } = props;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const expiresAtByPacketId = useTopologyStore((s) => s.expiresAtByPacketId);

  const d = (data ?? {}) as ProtocolEdgeData;
  const protocol = d.protocol;
  const flights = Array.isArray(d.flights) ? d.flights : [];

  const baseColor = protocol ? (PROTOCOL_META[protocol]?.color ?? '#4b5563') : '#4b5563';

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const safePath = useMemo(() => edgePath.replaceAll("'", "\\'"), [edgePath]);
  const label = (protocol && PROTOCOL_META[protocol]?.label) ?? protocol ?? '';

  const activeFlights = useMemo(() => {
    return flights.filter((f) => {
      const ttlEndAt =
        f.packetId && expiresAtByPacketId[f.packetId] ? expiresAtByPacketId[f.packetId] : f.expiresAt;

      const hopEndAt = f.startedAt + Math.max(10, Math.round(f.durationMs));
      const endAt = Math.min(hopEndAt, ttlEndAt);

      return now < endAt;
    });
  }, [flights, expiresAtByPacketId, now]);

  const visibleFlights = activeFlights.slice(-MAX_FLIGHTS_VISIBLE);
  const hasPacket = visibleFlights.length > 0;

  const edgeStyle: CSSProperties = {
    ...(style ?? {}),
    stroke: selected ? '#dc2626' : baseColor,
    strokeWidth: selected ? 4 : hasPacket ? 4 : 2,
    strokeDasharray: hasPacket ? '6 4' : undefined,
  };

  const [edgeHover, setEdgeHover] = useState(false);
  const [popoverHover, setPopoverHover] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const newestActiveFlight = useMemo(() => {
    if (activeFlights.length === 0) return null;
    const sorted = [...activeFlights].sort((a, b) => b.startedAt - a.startedAt);
    return sorted[0];
  }, [activeFlights]);

  const payload = useMemo(() => {
    if (!newestActiveFlight) return null;
    const anyF = newestActiveFlight as any;
    return anyF.payload ?? anyF.packet?.payload ?? null;
  }, [newestActiveFlight]);

  const payloadLines = useMemo(() => payloadToLines(payload), [payload]);

  const showPopover = (edgeHover || popoverHover) && newestActiveFlight !== null;

  const openEdgeHover = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setEdgeHover(true);
  };

  const closeEdgeHoverDelayed = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setEdgeHover(false);
    }, 120);
  };

  return (
    <>
      <style>
        {`
          @keyframes packet-move {
            from { offset-distance: 0%; }
            to   { offset-distance: 100%; }
          }
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
          animation: hasPacket ? 'sd-dash 0.35s linear infinite' : undefined,
        }}
        markerEnd={undefined}
      />

      {/* Hover-Hitfläche für die Kante */}
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
        {/* Label bleibt wie bisher */}
        <div
          style={{
            position: 'absolute',
            left: labelX,
            top: labelY,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          {label && (
            <span className="rounded bg-white/90 px-1 py-0.5 text-[10px] text-gray-700 shadow-sm">{label}</span>
          )}
        </div>

        {/* Paketicons bleiben wie bisher */}
        {visibleFlights.map((f) => {
          const duration = Math.max(10, Math.round(f.durationMs));

          const elapsed = Math.max(0, now - f.startedAt);
          const delay = -Math.min(elapsed, duration - 1);

          const ttlEndAt =
            f.packetId && expiresAtByPacketId[f.packetId] ? expiresAtByPacketId[f.packetId] : f.expiresAt;

          const remainingMs = Math.max(0, ttlEndAt - now);
          const ttlSeconds = remainingMs / 1000;
          const ttlLabel = ttlSeconds >= 10 ? String(Math.floor(ttlSeconds)) : ttlSeconds.toFixed(1);

          const packetStyle: PacketStyle = {
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',

            animation: `${duration}ms linear 1 packet-move`,
            animationDelay: `${delay}ms`,
            animationDirection: f.direction === 'backward' ? 'reverse' : 'normal',
            animationFillMode: 'forwards',

            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))',

            offsetDistance: '0%',
            offsetRotate: '0deg',
            offsetPath: `path('${safePath}')`,
          };

          return (
            <div
              key={f.id}
              style={packetStyle}
              title={`${f.sourceDeviceId} → ${f.targetDeviceId}${f.packetId ? ` (${f.packetId})` : ''}`}
            >
              <div style={{ position: 'relative', width: PACKET_ICON_PX, height: PACKET_ICON_PX }}>
                <svg width={PACKET_ICON_PX} height={PACKET_ICON_PX} viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
                    fill="#facc15"
                    stroke="#111827"
                    strokeWidth="1.2"
                  />
                  <path d="M5 8l7 5 7-5" fill="none" stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>

                <div
                  style={{
                    position: 'absolute',
                    right: -6,
                    top: -6,
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: 'rgba(17,24,39,0.92)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}
                >
                  {ttlLabel}
                </div>
              </div>
            </div>
          );
        })}

        {/* Popover an der Label-Position, also dort wo auch dein Delete-Icon sitzt */}
        {showPopover && (
          <div
            style={{
              position: 'absolute',
              left: labelX,
              top: labelY - 10,
              transform: 'translate(-50%, -100%)',
              zIndex: 9999,
              width: 340,
              maxWidth: '70vw',
              background: 'white',
              border: '1px solid rgba(0,0,0,0.16)',
              borderRadius: 12,
              boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
              padding: 10,
              fontSize: 12,
              pointerEvents: 'auto',
            }}
            onMouseEnter={() => {
              if (closeTimer.current) window.clearTimeout(closeTimer.current);
              closeTimer.current = null;
              setPopoverHover(true);
            }}
            onMouseLeave={() => {
              setPopoverHover(false);
              closeEdgeHoverDelayed();
            }}
          >
            <div style={{ fontWeight: 800, color: '#111827' }}>Payload der Pakete auf dieser Kante:</div>
            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: '#111827', lineHeight: 1.35 }}>
              {payloadLines.join('\n')}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export default ProtocolEdge;

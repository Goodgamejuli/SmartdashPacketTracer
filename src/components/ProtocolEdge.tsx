import React, { type CSSProperties, useEffect, useMemo, useState } from 'react';
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

  // ✅ WICHTIG: Flight ist nur aktiv bis min(HopEnde, TTL-Ende)
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
          {label && (
            <span className="rounded bg-white/90 px-1 py-0.5 text-[10px] text-gray-700 shadow-sm">{label}</span>
          )}
        </div>

        {visibleFlights.map((f) => {
          const duration = Math.max(10, Math.round(f.durationMs));

          // negative delay => re-render startet nicht wieder bei 0%
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

            // ok, weil wir aktivFlights hart begrenzen bis Hop-Ende/TTL-Ende
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
      </EdgeLabelRenderer>
    </>
  );
};

export default ProtocolEdge;

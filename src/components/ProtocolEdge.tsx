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

const PAUSE_EVENT = 'smartdash:pause';

function getGlobalPaused() {
  return Boolean((window as any).__smartdashPaused);
}

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

const pausedFlightsByEdgeId = new Map<string, FlightEvent[]>();
const pausedNowByEdgeId = new Map<string, number>();

const ProtocolEdge: React.FC<EdgeProps> = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, data, selected } = props;
  const edgeKey = String(id);

  const expiresAtByPacketId = useTopologyStore((s) => (s as any).expiresAtByPacketId);
  const routeStatusById = useTopologyStore((s) => (s as any).routeStatusById);
  const routeNameById = useTopologyStore((s) => (s as any).routeNameById);

  const d = (data ?? {}) as ProtocolEdgeData;
  const protocol = d.protocol;
  const flightsLive = Array.isArray(d.flights) ? d.flights : [];

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

  const [isPaused, setIsPaused] = useState(() => getGlobalPaused());
  const [now, setNow] = useState(() => Date.now());

  const computeActiveFlights = (list: FlightEvent[], nowMs: number, ignoreTtl: boolean) => {
    return list.filter((f) => {
      const hopEndAt = f.startedAt + Math.max(10, Math.round(f.durationMs));

      if (ignoreTtl) {
        return nowMs >= f.startedAt && nowMs < hopEndAt;
      }

      const ttlEndAt =
        (f as any).packetId && expiresAtByPacketId?.[(f as any).packetId]
          ? expiresAtByPacketId[(f as any).packetId]
          : (f as any).expiresAt;

      const endAt = Math.min(hopEndAt, ttlEndAt);
      return nowMs >= f.startedAt && nowMs < endAt;
    });
  };

  const activeFlights = useMemo(() => {
    return computeActiveFlights(flightsLive, now, false);
  }, [flightsLive, now, expiresAtByPacketId]);

  const visibleFlightsLive = useMemo(() => activeFlights.slice(-MAX_FLIGHTS_VISIBLE), [activeFlights]);

  const visibleFlightsLiveRef = useRef<FlightEvent[]>(visibleFlightsLive);
  useEffect(() => {
    visibleFlightsLiveRef.current = visibleFlightsLive;
  }, [visibleFlightsLive]);

  useEffect(() => {
    const onPause = (e: Event) => {
      const paused = Boolean((e as CustomEvent).detail?.paused);

      if (paused) {
        const t = Date.now();
        pausedNowByEdgeId.set(edgeKey, t);

        // nur aktuell aktive Flights behalten
        pausedFlightsByEdgeId.set(edgeKey, visibleFlightsLiveRef.current);

        setIsPaused(true);
        setNow(t);
        return;
      }

      pausedNowByEdgeId.delete(edgeKey);
      pausedFlightsByEdgeId.delete(edgeKey);

      setIsPaused(false);
      setNow(Date.now());
    };

    window.addEventListener(PAUSE_EVENT, onPause as any);
    return () => window.removeEventListener(PAUSE_EVENT, onPause as any);
  }, [edgeKey]);

  useEffect(() => {
    if (isPaused) return;

    // Interval nur dann, wenn es wirklich etwas zu animieren gibt
    if (flightsLive.length === 0) return;

    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [isPaused, flightsLive.length]);

  const pausedNow = pausedNowByEdgeId.get(edgeKey);
  const snapshotFlights = pausedFlightsByEdgeId.get(edgeKey);

  const visibleFlights = isPaused && snapshotFlights && typeof pausedNow === 'number'
    ? snapshotFlights
    : visibleFlightsLive;

  const hasPacket = visibleFlights.length > 0;

  const edgeStyle: CSSProperties = {
    ...(style ?? {}),
    stroke: selected ? '#dc2626' : baseColor,
    strokeWidth: selected ? 4 : hasPacket ? 4 : 2,
    strokeDasharray: hasPacket ? '6 4' : undefined,
  };

  const playState = isPaused ? ('paused' as const) : ('running' as const);

  const [edgeHover, setEdgeHover] = useState(false);
  const [popoverHover, setPopoverHover] = useState(false);

  useEffect(() => {
    if (!edgeHover) setPopoverHover(false);
  }, [edgeHover]);

  useEffect(() => {
    if (visibleFlights.length === 0) setPopoverHover(false);
  }, [visibleFlights.length]);

  const closeTimer = useRef<number | null>(null);

  const routesOnEdge = useMemo(() => {
    if (!(edgeHover || popoverHover)) return [];

    const map = new Map<number, { routeId: number; routeName: string; status: string; count: number }>();

    for (const f of visibleFlights) {
      const p = (f as any)?.payload;
      if (!p || typeof p !== 'object') continue;

      const ridRaw = (p as any).routeId;
      const rid = typeof ridRaw === 'number' ? ridRaw : Number(ridRaw);
      if (!Number.isFinite(rid) || rid <= 0) continue;

      const routeName = String(routeNameById?.[rid] ?? (p as any).routeName ?? `Route ${rid}`);
      const status = String(routeStatusById?.[rid] ?? (p as any).status ?? '');

      const existing = map.get(rid);
      if (existing) existing.count += 1;
      else map.set(rid, { routeId: rid, routeName, status, count: 1 });
    }

    return Array.from(map.values()).sort((a, b) => a.routeId - b.routeId);
  }, [edgeHover, popoverHover, visibleFlights, routeNameById, routeStatusById]);

  const showPopover = (edgeHover || popoverHover) && routesOnEdge.length > 0;

  const openEdgeHover = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setEdgeHover(true);
  };

  const closeEdgeHoverDelayed = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setEdgeHover(false), 120);
  };

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
        id={edgeKey}
        path={edgePath}
        style={{
          ...edgeStyle,
          animation: hasPacket ? 'sd-dash 0.35s linear infinite' : undefined,
          animationPlayState: playState,
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
          {label && (
            <span className="rounded bg-white/90 px-1 py-0.5 text-[10px] text-gray-700 shadow-sm">{label}</span>
          )}
        </div>

        {visibleFlights.map((f) => {
          const duration = Math.max(10, Math.round(f.durationMs));

          const renderNow = isPaused && typeof pausedNow === 'number' ? pausedNow : now;

          // Pause: TTL ignorieren
          const endAt = f.startedAt + duration;
          if (renderNow >= endAt) return null;

          const elapsed = Math.max(0, renderNow - f.startedAt);

          let t = elapsed / duration;
          t = Math.min(0.999, Math.max(0, t));
          if (f.direction === 'backward') t = 1 - t;

          const packetStyle: PacketStyle = {
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'none',
            offsetPath: `path('${safePath}')`,
            offsetDistance: `${t * 100}%`,
            offsetRotate: '0deg',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))',
          };

          const payloadLines = payloadToLines((f as any)?.payload);

          return (
            <div
              key={String(f.id)}
              style={packetStyle}
              title={`${f.sourceDeviceId} → ${f.targetDeviceId}${(f as any).packetId ? ` (${(f as any).packetId})` : ''}\n${payloadLines.join('\n')}`}
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
              </div>
            </div>
          );
        })}

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
            <div style={{ fontWeight: 800, color: '#111827' }}>Pakete auf dieser Kante (pro Route):</div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {routesOnEdge.map((r) => (
                <div
                  key={r.routeId}
                  style={{
                    border: '1px solid rgba(0,0,0,0.10)',
                    borderRadius: 10,
                    padding: 8,
                    background: '#fff',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#111827' }}>
                    {r.routeName} <span style={{ fontWeight: 700, color: '#6b7280' }}>×{r.count}</span>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
                    {r.status || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export default ProtocolEdge;
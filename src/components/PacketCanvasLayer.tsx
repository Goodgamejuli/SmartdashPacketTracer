import React, { useEffect, useMemo, useRef } from 'react';
import { useViewport } from '@xyflow/react';

// Wichtig: Der Canvas-Layer zeichnet aus einem globalen Map.
// Damit Briefe auf *allen* Kanten auftauchen, muss dieses Map bei Änderungen
// am Store zuverlässig befüllt werden.
import { useTopologyStore } from '../model/useTopologyStore';

type VisualFlight = {
  id: string;
  edgeKey: string;
  startedAt: number;
  durationMs: number;
  direction: 'forward' | 'backward';
  packetId?: string;
  payload?: Record<string, unknown>;
  sourceDeviceId: string;
  targetDeviceId: string;
  protocol: string;
};

type EdgeGeom = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
};

const PAUSE_EVENT = 'smartdash:pause';
const GLOBAL_FLIGHTS_KEY = '__smartdashFlightsByKey';
const GLOBAL_GEOM_KEY = '__smartdashEdgeGeomByKey';

function getFlightsMap(): Map<string, VisualFlight[]> {
  const w = window as any;
  if (!w[GLOBAL_FLIGHTS_KEY]) w[GLOBAL_FLIGHTS_KEY] = new Map<string, VisualFlight[]>();
  return w[GLOBAL_FLIGHTS_KEY] as Map<string, VisualFlight[]>;
}

function getGeomMap(): Map<string, EdgeGeom> {
  const w = window as any;
  if (!w[GLOBAL_GEOM_KEY]) w[GLOBAL_GEOM_KEY] = new Map<string, EdgeGeom>();
  return w[GLOBAL_GEOM_KEY] as Map<string, EdgeGeom>;
}

function isPausedNow() {
  return Boolean((window as any).__smartdashPaused);
}

function controlPoint(pos: any, x1: number, y1: number, x2: number, y2: number) {
  const curvature = 0.25;
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);

  const p = String(pos ?? '').toLowerCase();
  if (p.includes('left')) return { x: x1 - dx * curvature, y: y1 };
  if (p.includes('right')) return { x: x1 + dx * curvature, y: y1 };
  if (p.includes('top')) return { x: x1, y: y1 - dy * curvature };
  if (p.includes('bottom')) return { x: x1, y: y1 + dy * curvature };

  return { x: x1 + dx * curvature, y: y1 };
}

function cubicAt(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function drawEnvelope(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const r = 4;
  const w = s;
  const h = s * 0.78;

  ctx.save();
  ctx.translate(x - w / 2, y - h / 2);

  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.22);
  ctx.lineTo(w * 0.5, h * 0.62);
  ctx.lineTo(w * 0.92, h * 0.22);
  ctx.stroke();

  ctx.restore();
}

const PacketCanvasLayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const { x: vx, y: vy, zoom } = useViewport();

  const pausedAtRef = useRef<number | null>(null);
  const frozenNowRef = useRef<number>(Date.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    (window as any).__smartdashCanvasPackets = true;
  }, []);

  // ---------------------------------------------------------------------------
  // Flights aus dem Zustand in das globale Map spiegeln.
  // Ohne diese Synchronisation bleibt das globale Map leer und der Canvas
  // zeichnet keine Briefe.
  const flightsByEdgeId = useTopologyStore((s) => s.flightsByEdgeId);
  const edges = useTopologyStore((s) => s.edges);

  useEffect(() => {
    const flightsMap = getFlightsMap();
    flightsMap.clear();

    const protocolByEdgeId: Record<string, string> = {};
    for (const e of edges) {
      protocolByEdgeId[e.id] = (e.protocol as unknown as string) || '';
    }

    for (const edgeId of Object.keys(flightsByEdgeId)) {
      const arr = flightsByEdgeId[edgeId];
      if (!arr || arr.length === 0) continue;

      const vflights: VisualFlight[] = arr.map((f) => ({
        id: f.id,
        edgeKey: edgeId,
        startedAt: f.startedAt,
        durationMs: f.durationMs,
        direction: f.direction,
        packetId: f.packetId,
        payload: typeof f.payload === 'object' ? (f.payload as Record<string, unknown>) : undefined,
        sourceDeviceId: f.sourceDeviceId,
        targetDeviceId: f.targetDeviceId,
        protocol: protocolByEdgeId[edgeId] ?? '',
      }));

      flightsMap.set(edgeId, vflights);
    }
  }, [flightsByEdgeId, edges]);

  useEffect(() => {
    const onPause = (e: Event) => {
      const paused = Boolean((e as CustomEvent).detail?.paused);
      if (paused) {
        pausedAtRef.current = Date.now();
        frozenNowRef.current = pausedAtRef.current;
      } else {
        pausedAtRef.current = null;
        frozenNowRef.current = Date.now();
      }
    };

    window.addEventListener(PAUSE_EVENT, onPause as any);
    return () => window.removeEventListener(PAUSE_EVENT, onPause as any);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      cv.width = Math.floor(r.width * dpr);
      cv.height = Math.floor(r.height * dpr);
      cv.style.width = `${Math.floor(r.width)}px`;
      cv.style.height = `${Math.floor(r.height)}px`;
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = () => {
    const cv = canvasRef.current;
    const el = wrapRef.current;
    if (!cv || !el) return;

    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const r = el.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);

    const now = isPausedNow() ? frozenNowRef.current : Date.now();
    if (!isPausedNow()) frozenNowRef.current = now;

    const flightsByKey = getFlightsMap();
    const geomByKey = getGeomMap();

    let drawn = 0;
    const DRAW_CAP = 400;

    for (const [edgeKey, flights] of flightsByKey.entries()) {
      const geom = geomByKey.get(edgeKey);
      if (!geom) continue;

      const c1 = controlPoint(geom.sourcePosition, geom.sourceX, geom.sourceY, geom.targetX, geom.targetY);
      const c2 = controlPoint(geom.targetPosition, geom.targetX, geom.targetY, geom.sourceX, geom.sourceY);

      for (let i = flights.length - 1; i >= 0; i -= 1) {
        const f = flights[i];
        const dur = Math.max(80, Math.round(f.durationMs));
        const endAt = f.startedAt + dur;

        if (now < f.startedAt) continue;
        if (now >= endAt) continue;

        let t = (now - f.startedAt) / dur;
        t = Math.min(0.999, Math.max(0, t));
        if (f.direction === 'backward') t = 1 - t;

        const fx = cubicAt(t, geom.sourceX, c1.x, c2.x, geom.targetX);
        const fy = cubicAt(t, geom.sourceY, c1.y, c2.y, geom.targetY);

        const sx = fx * zoom + vx;
        const sy = fy * zoom + vy;

        drawEnvelope(ctx, sx, sy, 18);

        drawn += 1;
        if (drawn >= DRAW_CAP) break;
      }

      if (drawn >= DRAW_CAP) break;
    }
  };

  const loop = () => {
    draw();
    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vx, vy, zoom]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PacketCanvasLayer;
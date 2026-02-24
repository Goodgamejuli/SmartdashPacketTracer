import { create } from 'zustand';
import type { Protocol } from '../model/schema';

/** RollingLog kompatibel */
export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'wire';

export type WsLogLevel = 'info' | 'success' | 'warn' | 'error' | 'wire';
export type LogEntry = { id: string; ts: number; level: WsLogLevel; text: string };
const MAX_LOG_ENTRIES = 500;

export type Device = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  protocols: Protocol[];
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  protocol: Protocol;

  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type TopologySnapshot = {
  meta: {
    exportedAt: string;
    deviceCount: number;
    edgeCount: number;
  };
  devices: Device[];
  edges: Edge[];
};

//FlightEvent = sichtbares Paket auf Kante
export type FlightEvent = {
  id: string;
  packetId?: string;
  payload?: unknown;
  edgeId: string;
  startedAt: number;
  durationMs: number;
  expiresAt: number;
  direction: 'forward' | 'backward';
  sourceDeviceId: string;
  targetDeviceId: string;
};

export type PacketLike = {
 
  source?: string;
  target?: string;
  from?: string;
  to?: string;
  src?: string;
  dst?: string;
  sourceDeviceId?: string;
  targetDeviceId?: string;
  protocol?: Protocol;

  //Hop-Animationdauer 
  durationMs?: number;
  packetRateMs?: number;

  ttlMs?: number;
  packetId?: string;
  timestamp?: number | string;
  [key: string]: unknown;
};

let _id = 0;
const nextId = () => String(++_id);

const packetExpiryTimers = new Map<string, number>();

const packetProgressById = new Map<string, { lastTargetId: string; nextStartAt: number }>();
const nextHopStartAtByPacketId = new Map<string, number>();

const BASE_SPEED_PX_PER_S = 240; // zentraler Basiswert: 1.0 => 240 px/s
const EDGE_SCALE_MIN = 0.35;
const EDGE_SCALE_MAX = 4.0;

function scaledDurationMs(devs: Device[], srcId: string, dstId: string, baseMs: number): number {
  const base = Math.max(10, Math.round(baseMs));

  const a = devs.find((x) => x.id === srcId);
  const b = devs.find((x) => x.id === dstId);

  if (!a || !b) return base;

  const distPx = Math.hypot(a.x - b.x, a.y - b.y);
  let scale = distPx / SPEED_REF_PX;
  scale = Math.max(EDGE_SCALE_MIN, Math.min(EDGE_SCALE_MAX, scale));

  return Math.max(10, Math.round(base * scale));
}

const clampSpeedMultiplier = (m: number): number => {
  if (!Number.isFinite(m)) return 1;
  return Math.max(0.05, Math.min(10, m)); 
};

const edgeDistancePx = (edge: { source: string; target: string }, devices: Device[]): number => {
  const a = devices.find((d) => d.id === edge.source);
  const b = devices.find((d) => d.id === edge.target);
  if (!a || !b) return 200; // Fallback
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const durationMsFromSpeed = (distancePx: number, speedMultiplier: number): number => {
  const m = clampSpeedMultiplier(speedMultiplier);
  const pxPerS = BASE_SPEED_PX_PER_S * m;
  const seconds = distancePx / Math.max(1, pxPerS);
  return Math.max(10, Math.round(seconds * 1000));
};

const deadPacketIds = new Map<string, number>(); // packetId -> keepUntil
const DEAD_PACKET_RETENTION_MS = 60_000;

// Idee: Flight kurz vorm Animationsende entfernen für smootheness 
const REMOVE_BEFORE_ANIM_END_MS = 3000;
const SPEED_REF_PX = 300;

const updateSequenceSeed = (candidate: string | undefined) => {
  if (!candidate) return;
  const parsed = Number(candidate);
  if (!Number.isFinite(parsed)) return;
  if (parsed > _id) _id = parsed;
};

const normalizePacketId = (packetId: unknown): string | undefined => {
  if (typeof packetId !== 'string') return undefined;
  const pid = packetId.trim();
  return pid ? pid : undefined;
};

const isDeadPacketId = (pid: string, now: number): boolean => {
  const keepUntil = deadPacketIds.get(pid);
  if (typeof keepUntil !== 'number') return false;
  if (now >= keepUntil) {
    deadPacketIds.delete(pid);
    return false;
  }
  return true;
};

const markDeadPacketId = (pid: string) => {
  deadPacketIds.set(pid, Date.now() + DEAD_PACKET_RETENTION_MS);
};

const pickPacketEndpoints = (p: PacketLike) => {
  const source = String(p.source ?? p.from ?? p.src ?? p.sourceDeviceId ?? '').trim();
  const target = String(p.target ?? p.to ?? p.dst ?? p.targetDeviceId ?? '').trim();
  return { source, target };
};

type State = {  
  devices: Device[];
  edges: Edge[];
  logs: LogEntry[];
  routeStatusById: Record<number, string>;
  routeNameById: Record<number, string>;
  flightsByEdgeId: Record<string, FlightEvent[]>;
  expiresAtByPacketId: Record<string, number>;
  updateRateMs: number;
  packetTravelMs: number;
  packetSpeedPercent: number;

  addDevice: (d: Omit<Device, 'id'>) => Device;
  removeDevice: (id: string) => void;

  addEdge: (e: Omit<Edge, 'id'>) => Edge;
  removeEdge: (id: string) => void;

  updateDevicePosition: (id: string, x: number, y: number) => void;

  isPaused: boolean;
  pauseEpoch: number; // steigt bei jedem Toggle, praktisch für Reset/Debug

  setPaused: (paused: boolean) => void;
  togglePaused: () => void;

  addLog: (text: string, level?: WsLogLevel) => void;
  clearLog: () => void;

  clearAll: () => void;
  exportTopology: () => TopologySnapshot;
  importTopology: (snapshot: Partial<TopologySnapshot>) => void;

  setUpdateRateMs: (ms: number) => void;
  setPacketTravelMs: (ms: number) => void;
  setPacketSpeedPercent: (pct: number) => void;

  startFlight: (args: {
    edgeId: string;
    sourceDeviceId: string;
    targetDeviceId: string;
    direction?: 'forward' | 'backward';
    durationMs?: number;
    ttlMs?: number; 
    packetId?: string; 
    startedAt?: number;
    payload?: unknown;
  }) => void;

  ingestPacket: (packet: PacketLike) => void;
  clearFlights: () => void;
};

export const useTopologyStore = create<State>((set, get) => ({
  devices: [],
  edges: [],
  logs: [],
  routeStatusById: {},
  routeNameById: {},

  flightsByEdgeId: {},
  expiresAtByPacketId: {},

  updateRateMs: 120,
  packetTravelMs: 140,
  packetSpeedPercent: 100,
  isPaused: false,
  pauseEpoch: 0,

  addDevice: (d) => {
    const dev: Device = { id: nextId(), ...d };
    updateSequenceSeed(dev.id);
    set((s) => ({ devices: [...s.devices, dev] }));
    return dev;
  },

  removeDevice: (id) =>
    set((s) => {
      const remainingEdges = s.edges.filter((e) => e.source !== id && e.target !== id);

      const remainingEdgeIds = new Set(remainingEdges.map((e) => e.id));
      const flightsByEdgeId: Record<string, FlightEvent[]> = {};
      for (const [edgeId, flights] of Object.entries(s.flightsByEdgeId)) {
        if (remainingEdgeIds.has(edgeId)) flightsByEdgeId[edgeId] = flights;
      }

      return {
        devices: s.devices.filter((d) => d.id !== id),
        edges: remainingEdges,
        flightsByEdgeId,
      };
    }),

  addEdge: (e) => {
    const ed: Edge = { id: nextId(), ...e };
    updateSequenceSeed(ed.id);
    set((s) => ({ edges: [...s.edges, ed] }));
    return ed;
  },

  removeEdge: (id) =>
    set((s) => {
      const flightsByEdgeId = { ...s.flightsByEdgeId };
      delete flightsByEdgeId[id];
      return { edges: s.edges.filter((e) => e.id !== id), flightsByEdgeId };
    }),

  updateDevicePosition: (id, x, y) =>
    set((s) => ({ devices: s.devices.map((d) => (d.id === id ? { ...d, x, y } : d)) })),

  addLog: (text, level = 'info') =>
  set((s) => {
    const next = [...s.logs, { id: nextId(), ts: Date.now(), level, text: String(text ?? '') }];
    return { logs: next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next };
  }),
  clearLog: () => set({ logs: [] }),

  setPaused: (paused) =>
  set((s) => (s.isPaused === paused ? s : { isPaused: paused, pauseEpoch: s.pauseEpoch + 1 })),

  togglePaused: () =>
  set((s) => ({ isPaused: !s.isPaused, pauseEpoch: s.pauseEpoch + 1 })),

  clearAll: () => {
    for (const t of packetExpiryTimers.values()) window.clearTimeout(t);
    packetExpiryTimers.clear();
    deadPacketIds.clear();
    nextHopStartAtByPacketId.clear();
    packetProgressById.clear();

    set({
      devices: [],
      edges: [],
      flightsByEdgeId: {},
      expiresAtByPacketId: {},
    });
  },

  exportTopology: () => {
    const { devices, edges } = get();
    return {
      meta: {
        exportedAt: new Date().toISOString(),
        deviceCount: devices.length,
        edgeCount: edges.length,
      },
      devices,
      edges,
    };
  },

  importTopology: (snapshot) => {
    const devices = Array.isArray(snapshot?.devices)
      ? snapshot.devices.map((dev, index) => {
          const id = (dev as any)?.id?.trim?.() || nextId();
          updateSequenceSeed(id);
          return {
            ...(dev as any),
            id,
            x: typeof (dev as any)?.x === 'number' ? (dev as any).x : index * 80,
            y: typeof (dev as any)?.y === 'number' ? (dev as any).y : 60 + index * 40,
            protocols: Array.isArray((dev as any)?.protocols) ? ((dev as any).protocols as Protocol[]) : [],
          } as Device;
        })
      : [];

    const edges = Array.isArray(snapshot?.edges)
      ? snapshot.edges
          .filter((ed) => (ed as any)?.source && (ed as any)?.target && (ed as any)?.protocol)
          .map((ed) => {
            const id = (ed as any)?.id?.trim?.() || nextId();
            updateSequenceSeed(id);
            return {
              ...(ed as any),
              id,
              sourceHandle: (ed as any)?.sourceHandle ?? null,
              targetHandle: (ed as any)?.targetHandle ?? null,
            } as Edge;
          })
      : [];

    for (const t of packetExpiryTimers.values()) window.clearTimeout(t);
    packetExpiryTimers.clear();
    deadPacketIds.clear();
    nextHopStartAtByPacketId.clear();
    packetProgressById.clear();

    set({
      devices,
      edges,
      flightsByEdgeId: {},
      expiresAtByPacketId: {},
    });
  },

  setUpdateRateMs: (ms) => set({ updateRateMs: Math.max(10, Math.round(ms)) }),
  setPacketTravelMs: (ms) => set({ packetTravelMs: Math.max(10, Math.round(ms)) }),
  setPacketSpeedPercent: (pct) =>
  set({ packetSpeedPercent: Math.max(10, Math.min(500, Math.round(pct))) }),

  startFlight: ({ edgeId, sourceDeviceId, targetDeviceId, direction, durationMs, ttlMs, packetId, startedAt, payload }) => {
    const now = Date.now();
    const startAt = typeof startedAt === 'number' ? startedAt : now;
    const pid = normalizePacketId(packetId);
    const devs = get().devices;
    const baseMs = durationMs ?? get().packetTravelMs;
    const d0 = scaledDurationMs(devs, sourceDeviceId, targetDeviceId, baseMs);
    const speedPct = Math.max(10, Math.min(500, get().packetSpeedPercent));
    const speedFactor = Math.max(0.1, speedPct / 100); // 100% = normal, 200% = doppelt so schnell
    const d = Math.max(10, Math.round(d0 / speedFactor));

    if (pid && isDeadPacketId(pid, now)) return;
    let expiresAt: number;

    if (pid) {
      const existing = get().expiresAtByPacketId[pid];

      if (typeof existing === 'number') {
        expiresAt = existing;
      } else {
        const initialTtl = typeof ttlMs === 'number' ? Math.max(0, Math.round(ttlMs)) : d;
        expiresAt = now + initialTtl;

        if (expiresAt <= now) {
          markDeadPacketId(pid);
          return;
        }

        set((s) => ({
          expiresAtByPacketId: { ...s.expiresAtByPacketId, [pid]: expiresAt },
        }));

        // TTL-Cleanup 
        const prevTimer = packetExpiryTimers.get(pid);
        if (typeof prevTimer === 'number') window.clearTimeout(prevTimer);

        const msUntilExpire = Math.max(0, expiresAt - Date.now());
        const timerId = window.setTimeout(() => {
          markDeadPacketId(pid);

          set((s) => {
            const expiresAtByPacketId = { ...s.expiresAtByPacketId };
            delete expiresAtByPacketId[pid];

            const flightsByEdgeId: Record<string, FlightEvent[]> = {};
            for (const [eId, arr] of Object.entries(s.flightsByEdgeId)) {
              flightsByEdgeId[eId] = arr.filter((f) => f.packetId !== pid);
            }

            return { expiresAtByPacketId, flightsByEdgeId };
          });

          packetExpiryTimers.delete(pid);
        }, msUntilExpire + 5);

        packetExpiryTimers.set(pid, timerId);
      }

      // TTL bereits abgelaufen -> nichts mehr zeichnen
      if (expiresAt <= now) {
        markDeadPacketId(pid);
        return;
      }
    } else {
      const t = typeof ttlMs === 'number' ? Math.max(0, Math.round(ttlMs)) : d;
      expiresAt = now + t;
      if (expiresAt <= now) return;
    }

    // Flight erstellen 
    const flight: FlightEvent = {
      id: nextId(),
      packetId: pid,
      payload,
      edgeId,
      startedAt: startAt,
      durationMs: d,
      expiresAt,
      direction: direction ?? 'forward',
      sourceDeviceId,
      targetDeviceId,
    };

    set((s) => {
      const current = s.flightsByEdgeId[edgeId] ?? [];
      const next = [...current, flight].slice(-200); // max 200 Pakete/Route
      return { flightsByEdgeId: { ...s.flightsByEdgeId, [edgeId]: next } };
    });

    // Cleanup: genau am Ende der Animation entfernen (Node erreicht)
    const endAt = startAt + d;

    // falls TTL früher endet, dann TTL-Ende nehmen
    const removeAt = Math.min(endAt, expiresAt);

    const removeAfter = Math.max(10, removeAt - Date.now());

    window.setTimeout(() => {
      set((s) => {
        const current = s.flightsByEdgeId[edgeId] ?? [];
        const next = current.filter((f) => f.id !== flight.id);
        if (next.length === current.length) return s;
        return { flightsByEdgeId: { ...s.flightsByEdgeId, [edgeId]: next } };
      });
    }, removeAfter);
  },

  ingestPacket: (packet) => {
    const { source, target } = pickPacketEndpoints(packet);
    if (!source || !target) return;

    const now = Date.now();

    const devs = get().devices;
    const srcId = devs.find((d) => d.id === source)?.id ?? devs.find((d) => d.label === source)?.id ?? source;
    const dstId = devs.find((d) => d.id === target)?.id ?? devs.find((d) => d.label === target)?.id ?? target;

    const proto = packet.protocol;

    const ttlMs = typeof packet.ttlMs === 'number' ? packet.ttlMs : undefined;
    const pid = normalizePacketId(packet.packetId);

    // Späte Hops nach TTL-Ende schlucken
    if (pid && isDeadPacketId(pid, now)) return;

    if (pid) {
      const exp = get().expiresAtByPacketId[pid];
      if (typeof exp === 'number' && now >= exp) {
        markDeadPacketId(pid);
        return;
      }
    }

    const edge = get().edges.find((e) => {
      if (proto && e.protocol !== proto) return false;
      return (e.source === srcId && e.target === dstId) || (e.source === dstId && e.target === srcId);
    });
    if (!edge) return;

    const direction: 'forward' | 'backward' = edge.source === srcId ? 'forward' : 'backward';

    const pr = typeof (packet as any).packetRateMs === 'number' ? (packet as any).packetRateMs : undefined;
    const baseForEdge = typeof pr === 'number' ? pr : get().packetTravelMs;
    const d0 = scaledDurationMs(devs, srcId, dstId, baseForEdge);
    const speedPct = Math.max(10, Math.min(500, get().packetSpeedPercent));
    const speedFactor = Math.max(0.1, speedPct / 100);
    const d = Math.max(10, Math.round(d0 / speedFactor));

    let startedAt: number | undefined;

    if (pid) {
      const prog = packetProgressById.get(pid);

      // Erstes Hop eines Pakets: noch kein Progress bekannt
      if (!prog) {
        startedAt = now;
        packetProgressById.set(pid, { lastTargetId: dstId, nextStartAt: now + d });
      } else {
        // Echte Weiterleitung: Quelle muss das letzte Ziel sein
        if (srcId !== prog.lastTargetId) {
          return; 
        }

        startedAt = Math.max(now, prog.nextStartAt);
        packetProgressById.set(pid, { lastTargetId: dstId, nextStartAt: startedAt + d });
      }
    }

    const payload = (packet as any)?.payload;

    get().startFlight({
      edgeId: edge.id,
      sourceDeviceId: srcId,
      targetDeviceId: dstId,
      direction,
      durationMs: typeof pr === 'number' ? pr : undefined,
      ttlMs,
      packetId: pid,
      startedAt,
      payload: (packet as any)?.payload,
    });
  },

  clearFlights: () => {
    for (const t of packetExpiryTimers.values()) window.clearTimeout(t);
    packetExpiryTimers.clear();
    deadPacketIds.clear();
    nextHopStartAtByPacketId.clear();
    packetProgressById.clear();

    set({ flightsByEdgeId: {}, expiresAtByPacketId: {} });
  },
}));

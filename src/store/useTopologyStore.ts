import { create } from 'zustand';
import type { Protocol } from '../model/schema';

/** RollingLog kompatibel */
export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'wire';

export type LogEntry = {
  id: string;
  ts: number;
  level: LogLevel;
  text: string;
};

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

/**
 * FlightEvent = EIN sichtbares „Paket“ AUF EINER Edge (ein Hop).
 * Ein End-to-End-Paket besteht aus mehreren Flights (Hop für Hop).
 *
 * Wichtig:
 * - packetId verbindet alle Hops desselben Pakets
 * - expiresAt ist die „globale“ TTL für dieses packetId
 */
export type FlightEvent = {
  id: string;
  packetId?: string;

  edgeId: string;
  startedAt: number;

  /** Animationsdauer auf dieser Edge */
  durationMs: number;

  /** Globaler Ablaufzeitpunkt für dieses Paket */
  expiresAt: number;

  direction: 'forward' | 'backward';
  sourceDeviceId: string;
  targetDeviceId: string;
};

export type PacketLike = {
  // flexible Endpoint-Felder
  source?: string;
  target?: string;
  from?: string;
  to?: string;
  src?: string;
  dst?: string;

  sourceDeviceId?: string;
  targetDeviceId?: string;

  protocol?: Protocol;

  /** Hop-Animationdauer */
  durationMs?: number;
  edgeTravelMs?: number;

  /**
   * TTL optional:
   * - Wenn packetId noch NICHT bekannt: initialisiert TTL
   * - Wenn packetId schon bekannt: wird IGNORIERT (kein Reset!)
   */
  ttlMs?: number;

  /** paketübergreifende ID damit TTL nicht resetet */
  packetId?: string;

  timestamp?: number | string;

  [key: string]: unknown;
};

let _id = 0;
const nextId = () => String(++_id);

// Packet-ID -> Timer für TTL-Ablauf (damit wir TTL-Cleanup genau EINMAL planen)
const packetExpiryTimers = new Map<string, number>();

// Tombstones: wenn TTL abgelaufen ist, dürfen späte Hops derselben packetId NICHT "wiederbeleben"
const deadPacketIds = new Map<string, number>(); // packetId -> keepUntil
const DEAD_PACKET_RETENTION_MS = 60_000;

// ===== VISUAL CLEANUP TIMING (aus dem "everything works"-Stand abgeleitet) =====
// Idee: Flight wird VOR Animationsende entfernt => er kann nicht am Node parken.
// Größerer Wert => verschwindet früher (glatter, aber evtl. "kürzer sichtbar").
//
// Du kannst hier wie früher stark spielen (z.B. 80..400). In deinem alten Stand war es extrem hoch.
const REMOVE_BEFORE_ANIM_END_MS = 2000; // <-- HIER einstellen

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

  flightsByEdgeId: Record<string, FlightEvent[]>;

  /**
   * Damit TTL nicht pro Hop resetet:
   * packetId -> globales expiresAt
   */
  expiresAtByPacketId: Record<string, number>;

  updateRateMs: number;

  // Default-Hop-Dauer, falls kein edgeTravelMs kommt
  packetTravelMs: number;

  addDevice: (d: Omit<Device, 'id'>) => Device;
  removeDevice: (id: string) => void;

  addEdge: (e: Omit<Edge, 'id'>) => Edge;
  removeEdge: (id: string) => void;

  updateDevicePosition: (id: string, x: number, y: number) => void;

  addLog: (text: string, level?: LogLevel) => void;
  clearLog: () => void;

  clearAll: () => void;
  exportTopology: () => TopologySnapshot;
  importTopology: (snapshot: Partial<TopologySnapshot>) => void;

  setUpdateRateMs: (ms: number) => void;
  setPacketTravelMs: (ms: number) => void;

  startFlight: (args: {
    edgeId: string;
    sourceDeviceId: string;
    targetDeviceId: string;
    direction?: 'forward' | 'backward';
    durationMs?: number;
    ttlMs?: number; // optional: nur beim „Start“ sinnvoll
    packetId?: string; // wichtig für TTL carry-over
  }) => void;

  ingestPacket: (packet: PacketLike) => void;
  clearFlights: () => void;
};

export const useTopologyStore = create<State>((set, get) => ({
  devices: [],
  edges: [],
  logs: [],

  flightsByEdgeId: {},
  expiresAtByPacketId: {},

  updateRateMs: 120,

  // Default pro Hop (nur falls Packet kein edgeTravelMs liefert)
  packetTravelMs: 140,

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
    set((s) => ({ logs: [...s.logs, { id: nextId(), ts: Date.now(), level, text: String(text) }] })),

  clearLog: () => set({ logs: [] }),

  clearAll: () => {
    for (const t of packetExpiryTimers.values()) window.clearTimeout(t);
    packetExpiryTimers.clear();
    deadPacketIds.clear();

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

    set({
      devices,
      edges,
      flightsByEdgeId: {},
      expiresAtByPacketId: {},
    });
  },

  setUpdateRateMs: (ms) => set({ updateRateMs: Math.max(10, Math.round(ms)) }),
  setPacketTravelMs: (ms) => set({ packetTravelMs: Math.max(10, Math.round(ms)) }),

  startFlight: ({ edgeId, sourceDeviceId, targetDeviceId, direction, durationMs, ttlMs, packetId }) => {
    const now = Date.now();
    const d = Math.max(10, Math.round(durationMs ?? get().packetTravelMs));
    const pid = normalizePacketId(packetId);

    // 0) Wenn TTL schon abgelaufen war -> niemals wiederbeleben
    if (pid && isDeadPacketId(pid, now)) return;

    // 1) TTL-Logik (WICHTIG):
    // - TTL darf nach jedem Hop NICHT resetten.
    // - expiresAt wird pro packetId EINMAL festgelegt und dann nur noch übernommen.
    // - ttlMs wird NUR berücksichtigt, wenn packetId noch KEIN expiresAt besitzt.
    let expiresAt: number;

    if (pid) {
      const existing = get().expiresAtByPacketId[pid];

      if (typeof existing === 'number') {
        expiresAt = existing;
      } else {
        const initialTtl = typeof ttlMs === 'number' ? Math.max(0, Math.round(ttlMs)) : d;
        expiresAt = now + initialTtl;

        // TTL schon 0 -> sofort "dead"
        if (expiresAt <= now) {
          markDeadPacketId(pid);
          return;
        }

        // Mapping setzen
        set((s) => ({
          expiresAtByPacketId: { ...s.expiresAtByPacketId, [pid]: expiresAt },
        }));

        // TTL-Cleanup genau EINMAL planen
        const prevTimer = packetExpiryTimers.get(pid);
        if (typeof prevTimer === 'number') window.clearTimeout(prevTimer);

        const msUntilExpire = Math.max(0, expiresAt - Date.now());
        const timerId = window.setTimeout(() => {
          // TTL abgelaufen -> global kill + tombstone (späte Hops schlucken)
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
      // Keine packetId => jedes Hop ist „eigenes Paket“
      const t = typeof ttlMs === 'number' ? Math.max(0, Math.round(ttlMs)) : d;
      expiresAt = now + t;
      if (expiresAt <= now) return;
    }

    // 2) Flight erstellen (Hop auf dieser Edge)
    const flight: FlightEvent = {
      id: nextId(),
      packetId: pid,
      edgeId,
      startedAt: now,
      durationMs: d,
      expiresAt,
      direction: direction ?? 'forward',
      sourceDeviceId,
      targetDeviceId,
    };

    set((s) => {
      const current = s.flightsByEdgeId[edgeId] ?? [];
      const next = [...current, flight].slice(-200);
      return { flightsByEdgeId: { ...s.flightsByEdgeId, [edgeId]: next } };
    });

    // 3) VISUAL CLEANUP (das ist die relevante Funktion aus deinem alten Stand)
    // Bedingung ist NICHT "TTL <= 0", sondern:
    // => Flight verschwindet, wenn Hop-Ende erreicht ODER TTL-Ende erreicht (was früher kommt).
    //
    // In deinem alten Stand wurde "Hop-Ende" früher gesetzt (d - REMOVE_BEFORE_ANIM_END_MS),
    // damit nichts am Node parkt.
    const msUntilTtlEnd = Math.max(0, expiresAt - Date.now());

    // früher als Animationsende löschen:
    const msUntilHopDisappear = Math.max(10, d - Math.max(0, REMOVE_BEFORE_ANIM_END_MS));

    // entscheidend: min(HopDisappear, TTL-Ende)
    const removeAfter = Math.max(10, Math.min(msUntilHopDisappear, msUntilTtlEnd));

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

    const durationMs =
      typeof packet.edgeTravelMs === 'number'
        ? packet.edgeTravelMs
        : typeof packet.durationMs === 'number'
          ? packet.durationMs
          : undefined;

    const ttlMs = typeof packet.ttlMs === 'number' ? packet.ttlMs : undefined;
    const pid = normalizePacketId(packet.packetId);

    // (A) Späte Hops nach TTL-Ende werden geschluckt
    if (pid && isDeadPacketId(pid, now)) return;

    // (B) Wenn packetId existiert und TTL bereits abgelaufen -> tombstone setzen und ignorieren
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

    get().startFlight({
      edgeId: edge.id,
      sourceDeviceId: srcId,
      targetDeviceId: dstId,
      direction,
      durationMs,
      ttlMs,
      packetId: pid,
    });
  },

  clearFlights: () => {
    for (const t of packetExpiryTimers.values()) window.clearTimeout(t);
    packetExpiryTimers.clear();
    deadPacketIds.clear();

    set({ flightsByEdgeId: {}, expiresAtByPacketId: {} });
  },
}));

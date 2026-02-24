import { useTopologyStore, type PacketLike } from '../model/useTopologyStore';
import type { Protocol } from '../model/schema';
import { PROTOCOL_META } from '../model/protocols';

export type WsLogLevel = 'info' | 'success' | 'warn' | 'error' | 'wire';

export type HopPacketMessage = {
  timestamp?: number | string;
  sourceDeviceId: string;
  targetDeviceId: string;
  packetRateMs?: number;
  protocol: unknown;
  ttlMs?: number;
  packetId?: string;
  messageType?: string;
  payload?: Record<string, unknown>;
  speedMultiplier?: number;
};

type LogMessage = { type: 'log'; level?: WsLogLevel; text?: string; message?: string };
type PacketEnvelope = { type: 'packet'; packet: HopPacketMessage };
type UnknownObject = Record<string, unknown>;

function isObject(v: unknown): v is UnknownObject {
  return typeof v === 'object' && v !== null;
}

const PROTOCOL_SET = new Set(Object.keys(PROTOCOL_META));

function toProtocol(value: unknown): Protocol | null {
  if (typeof value !== 'string') return null;
  if (PROTOCOL_SET.has(value)) return value as Protocol;
  return null;
}

function isPausedNow() {
  return typeof window !== 'undefined' && Boolean((window as any).__smartdashPaused);
}

function getOrCreateGlobalMap<T>(key: string): Map<string, T> {
  const w = window as any;
  if (!w[key]) w[key] = new Map<string, T>();
  return w[key] as Map<string, T>;
}

export type VisualFlight = {
  id: string;
  edgeKey: string;
  startedAt: number;
  durationMs: number;
  direction: 'forward' | 'backward';
  packetId?: string;
  payload?: Record<string, unknown>;
  sourceDeviceId: string;
  targetDeviceId: string;
  protocol: Protocol;
};

const GLOBAL_FLIGHTS_KEY = '__smartdashFlightsByKey';

const MAX_FLIGHTS_PER_EDGE = 6;
const SWEEP_EVERY_MS = 1200;
let sweepTimer: number | null = null;

function scheduleSweep() {
  if (sweepTimer) return;
  sweepTimer = window.setTimeout(() => {
    sweepTimer = null;
    sweepOldFlights();
  }, SWEEP_EVERY_MS);
}

function sweepOldFlights() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const m = getOrCreateGlobalMap<VisualFlight[]>(GLOBAL_FLIGHTS_KEY);

  for (const [k, arr] of m.entries()) {
    const kept = arr.filter((f) => now < f.startedAt + f.durationMs + 250);
    if (kept.length === 0) m.delete(k);
    else if (kept.length !== arr.length) m.set(k, kept);
  }
}

export function logToUi(text: string, level: WsLogLevel = 'info') {
  const clean = String(text ?? '').trim();
  if (!clean) return;

  const st: any = useTopologyStore.getState?.();
  const addLog = st?.addLog;

  if (typeof addLog === 'function') {
    if (addLog.length >= 2) addLog(clean, level);
    else addLog(clean);
  }
}

function pushVisualFlight(hop: HopPacketMessage) {
  const proto = toProtocol(hop.protocol);
  if (!proto) return;

  const src = String(hop.sourceDeviceId ?? '').trim();
  const dst = String(hop.targetDeviceId ?? '').trim();
  if (!src || !dst) return;

  const edgeKey = `${src}__${dst}__${proto}`;

  const baseRate = typeof hop.packetRateMs === 'number' ? hop.packetRateMs : 1600;
  const speed = typeof hop.speedMultiplier === 'number' ? hop.speedMultiplier : 1.0;

  const baseDuration = Math.max(80, Math.round(baseRate * speed * 0.5));

  const st: any = useTopologyStore.getState?.();
  const speedPct = typeof st?.packetSpeedPercent === 'number' ? st.packetSpeedPercent : 100;
  const speedFactor = Math.max(0.1, Math.min(5, speedPct / 100)); // 10..500% => 0.1..5.0

  const durationMs = Math.max(80, Math.round(baseDuration / speedFactor));

  const id = String(hop.packetId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const flight: VisualFlight = {
    id,
    edgeKey,
    startedAt: Date.now(),
    durationMs,
    direction: 'forward',
    packetId: hop.packetId,
    payload: hop.payload ?? {},
    sourceDeviceId: src,
    targetDeviceId: dst,
    protocol: proto,
  };

  const m = getOrCreateGlobalMap<VisualFlight[]>(GLOBAL_FLIGHTS_KEY);
  const arr = m.get(edgeKey) ?? [];
  arr.push(flight);

  const trimmed = arr.length > MAX_FLIGHTS_PER_EDGE ? arr.slice(-MAX_FLIGHTS_PER_EDGE) : arr;
  m.set(edgeKey, trimmed);

  scheduleSweep();
}

function pushStoreFlight(hop: HopPacketMessage) {
  const proto = toProtocol(hop.protocol);
  if (!proto) return;

  const st: any = useTopologyStore.getState?.();
  if (typeof st?.ingestPacket !== 'function') return;

  const p: PacketLike = {
    sourceDeviceId: String(hop.sourceDeviceId ?? '').trim(),
    targetDeviceId: String(hop.targetDeviceId ?? '').trim(),
    protocol: proto,
    packetRateMs: typeof hop.packetRateMs === 'number' ? hop.packetRateMs : undefined,
    ttlMs: typeof hop.ttlMs === 'number' ? hop.ttlMs : undefined,
    packetId: typeof hop.packetId === 'string' ? hop.packetId : undefined,
    payload: hop.payload ?? undefined,
    timestamp: hop.timestamp,
  };

  st.ingestPacket(p);
}

let packetQueue: HopPacketMessage[] = [];
let queueHead = 0;
let flushScheduled = false;

const MAX_QUEUE = 4000;
const MAX_VISUALS_PER_FRAME = 600;

let droppedPaused = 0;
let droppedOverflow = 0;

function pendingCount() {
  return packetQueue.length - queueHead;
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(flushPackets);
}

function flushPackets() {
  flushScheduled = false;

  if (isPausedNow()) {
    droppedPaused += pendingCount();
    packetQueue = [];
    queueHead = 0;
    return;
  }

  let processed = 0;
  while (queueHead < packetQueue.length && processed < MAX_VISUALS_PER_FRAME) {
    const hop = packetQueue[queueHead];
    pushVisualFlight(hop);
    pushStoreFlight(hop);
    queueHead += 1;
    processed += 1;
  }

  if (queueHead >= packetQueue.length) {
    packetQueue = [];
    queueHead = 0;
  } else if (queueHead > 1200) {
    packetQueue = packetQueue.slice(queueHead);
    queueHead = 0;
  }

  if (queueHead < packetQueue.length) scheduleFlush();
}

function enqueueHopPacket(hop: HopPacketMessage) {
  if (isPausedNow()) {
    droppedPaused += 1;
    return;
  }

  if (pendingCount() >= MAX_QUEUE) {
    droppedOverflow += 1;
    return;
  }

  packetQueue.push(hop);
  scheduleFlush();
}

let lastWireAt = 0;
function parseIncoming(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const t = Date.now();
    if (t - lastWireAt > 1200) {
      lastWireAt = t;
      logToUi(String(raw ?? ''), 'wire');
    }
    return [];
  }
}

function detectType(obj: UnknownObject): 'log' | 'config' | 'packet' | 'routeStatus' | 'unknown' {
  const t = obj.type ?? obj.kind ?? obj.event;
  if (t === 'log' || t === 'config' || t === 'packet' || t === 'routeStatus') return t;

  if (typeof obj.updateRateMs === 'number') return 'config';
  if (isObject(obj.packet)) return 'packet';
  if (obj.timestamp && obj.sourceDeviceId && obj.targetDeviceId && obj.protocol) return 'packet';
  if (typeof obj.text === 'string' || typeof obj.message === 'string') return 'log';

  return 'unknown';
}

let routeStatusBuf: Record<number, string> = {};
let routeStatusScheduled = false;

function flushRouteStatus() {
  routeStatusScheduled = false;
  const patch = routeStatusBuf;
  routeStatusBuf = {};

  if (typeof (useTopologyStore as any).setState === 'function') {
    (useTopologyStore as any).setState((s: any) => ({
      routeStatusById: {
        ...(s.routeStatusById ?? {}),
        ...patch,
      },
    }));
  }
}

function enqueueRouteStatus(routeId: number, status: string) {
  routeStatusBuf[routeId] = status;
  if (routeStatusScheduled) return;
  routeStatusScheduled = true;
  requestAnimationFrame(flushRouteStatus);
}

let lastUnknownAt = 0;

export function handleSmartdashMessage(raw: string) {
  const items = parseIncoming(raw);
  if (items.length === 0) return;

  for (const item of items) {
    if (!isObject(item)) continue;

    const type = detectType(item);

    if (type === 'log') {
      const msg = item as LogMessage;
      const level = (msg.level ?? 'info') as WsLogLevel;
      const text = String(msg.text ?? msg.message ?? '').trim();
      if (text) logToUi(text, level);
      continue;
    }

    if (type === 'config') {
      const ms = (item.updateRateMs ?? item['update_rate_ms']) as unknown;
      if (typeof ms === 'number') {
        const st: any = useTopologyStore.getState?.();
        if (typeof st?.setUpdateRateMs === 'function') st.setUpdateRateMs(ms);
      }
      continue;
    }

    if (type === 'packet') {
      const env = item as Partial<PacketEnvelope> & UnknownObject;
      const hop = (isObject(env.packet) ? env.packet : env) as HopPacketMessage;
      enqueueHopPacket(hop);
      continue;
    }

    if (type === 'routeStatus') {
      const routeId = Number((item as any).routeId);
      const status = String((item as any).status ?? '');
      if (Number.isFinite(routeId) && routeId > 0) enqueueRouteStatus(routeId, status);
      continue;
    }

    const t = Date.now();
    if (t - lastUnknownAt > 1500) {
      lastUnknownAt = t;
      logToUi(`Unbekannter Nachrichtentyp (keys: ${Object.keys(item).join(', ')})`, 'warn');
    }
  }
}
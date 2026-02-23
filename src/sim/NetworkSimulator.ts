import { useTopologyStore } from '../model/useTopologyStore';
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
};

type LogMessage = { type: 'log'; level?: WsLogLevel; text?: string; message?: string };
type PacketEnvelope = { type: 'packet'; packet: HopPacketMessage };
type UnknownObject = Record<string, unknown>;

function isObject(v: unknown): v is UnknownObject {
  return typeof v === 'object' && v !== null;
}

function toProtocol(value: unknown): Protocol | null {
  if (typeof value !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(PROTOCOL_META, value)) return value as Protocol;
  return null;
}

export function logToUi(text: string, level: WsLogLevel = 'info') {
  const clean = String(text ?? '').trim();
  if (!clean) return;
  useTopologyStore.getState().addLog(clean, level);
}

function ingestHopPacket(hop: HopPacketMessage) {
  const proto = toProtocol(hop.protocol);
  if (!proto) {
    logToUi(`Packet verworfen: unbekanntes protocol "${String(hop.protocol)}"`, 'error');
    return;
  }

  useTopologyStore.getState().ingestPacket({
    timestamp: hop.timestamp,
    sourceDeviceId: String(hop.sourceDeviceId ?? '').trim(),
    targetDeviceId: String(hop.targetDeviceId ?? '').trim(),
    protocol: proto,
    packetRateMs: hop.packetRateMs,
    ttlMs: hop.ttlMs,
    packetId: hop.packetId,
    messageType: hop.messageType ?? 'hop',
    payload: hop.payload ?? {},
  });
}

function isPausedNow() {
  return Boolean((window as any).__smartdashPaused);
}

let packetQueue: HopPacketMessage[] = [];
let queueHead = 0;
let flushScheduled = false;

const MAX_QUEUE = 2000;
const MAX_INGEST_PER_FRAME = 250;

let droppedWhilePaused = 0;
let droppedOverflow = 0;

function pendingCount() {
  return packetQueue.length - queueHead;
}

function clearQueue(reason: 'paused' | 'flush') {
  const pending = pendingCount();
  if (pending <= 0) return;

  if (reason === 'paused') droppedWhilePaused += pending;

  packetQueue = [];
  queueHead = 0;
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(flushPackets);
}

function flushPackets() {
  flushScheduled = false;

  if (isPausedNow()) {
    clearQueue('paused');
    if (droppedWhilePaused > 0 && droppedWhilePaused % 500 === 0) {
      logToUi(`Pause aktiv: ${droppedWhilePaused} Packets verworfen.`, 'warn');
    }
    return;
  }

  let processed = 0;
  while (queueHead < packetQueue.length && processed < MAX_INGEST_PER_FRAME) {
    ingestHopPacket(packetQueue[queueHead]);
    queueHead += 1;
    processed += 1;
  }

  if (queueHead >= packetQueue.length) {
    packetQueue = [];
    queueHead = 0;
  } else if (queueHead > 1000) {
    packetQueue = packetQueue.slice(queueHead);
    queueHead = 0;
  }

  if (queueHead < packetQueue.length) scheduleFlush();
}

function enqueueHopPacket(hop: HopPacketMessage) {
  if (isPausedNow()) {
    droppedWhilePaused += 1;
    if (droppedWhilePaused % 500 === 0) {
      logToUi(`Pause aktiv: ${droppedWhilePaused} Packets verworfen.`, 'warn');
    }
    return;
  }

  if (pendingCount() >= MAX_QUEUE) {
    droppedOverflow += 1;
    if (droppedOverflow % 500 === 0) {
      logToUi(`Queue voll: ${droppedOverflow} Packets verworfen.`, 'warn');
    }
    return;
  }

  packetQueue.push(hop);
  scheduleFlush();
}

function parseIncoming(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    logToUi(raw, 'wire');
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

  useTopologyStore.setState((s: any) => ({
    routeStatusById: {
      ...(s.routeStatusById ?? {}),
      ...patch,
    },
  }));
}

function enqueueRouteStatus(routeId: number, status: string) {
  routeStatusBuf[routeId] = status;
  if (routeStatusScheduled) return;
  routeStatusScheduled = true;
  requestAnimationFrame(flushRouteStatus);
}

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

    if (type === 'packet') {
      const env = item as Partial<PacketEnvelope> & UnknownObject;
      const hop = (isObject(env.packet) ? env.packet : env) as HopPacketMessage;
      enqueueHopPacket(hop);
      continue;
    }

    if (type === 'routeStatus') {
      const routeId = Number((item as any).routeId);
      const status = String((item as any).status ?? '');

      if (Number.isFinite(routeId) && routeId > 0) {
        enqueueRouteStatus(routeId, status);
      }
      continue;
    }

    logToUi(`Unbekannter Nachrichtentyp (keys: ${Object.keys(item).join(', ')})`, 'warn');
  }
}

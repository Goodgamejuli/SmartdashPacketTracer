import { useTopologyStore } from '../model/useTopologyStore';
import type { Protocol } from '../model/schema';
import { PROTOCOL_META } from '../model/protocols';

export type WsLogLevel = 'info' | 'success' | 'warn' | 'error' | 'wire';

export type HopPacketMessage = {
  timestamp?: number | string;
  sourceDeviceId: string;
  targetDeviceId: string;

  protocol: unknown;

  edgeTravelMs?: number; // Hop-Animationsdauer
  ttlMs?: number; // optional: nur beim Start setzen
  packetId?: string; // optional: für TTL carry-over

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

    edgeTravelMs: hop.edgeTravelMs,

    // TTL/packetId optional (carry-over möglich)
    ttlMs: hop.ttlMs,
    packetId: hop.packetId,

    messageType: hop.messageType ?? 'hop',
    payload: hop.payload ?? {},
  });
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

function detectType(obj: UnknownObject): 'log' | 'config' | 'packet' | 'unknown' {
  const t = obj.type ?? obj.kind ?? obj.event;
  if (t === 'log' || t === 'config' || t === 'packet') return t;

  if (typeof obj.updateRateMs === 'number') return 'config';
  if (isObject(obj.packet)) return 'packet';
  if (obj.timestamp && obj.sourceDeviceId && obj.targetDeviceId && obj.protocol) return 'packet';
  if (typeof obj.text === 'string' || typeof obj.message === 'string') return 'log';

  return 'unknown';
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

    if (type === 'config') {
      const ms = (item.updateRateMs ?? item['update_rate_ms']) as unknown;
      if (typeof ms === 'number') {
        useTopologyStore.getState().setUpdateRateMs(ms);
        logToUi(`Update-Rate: ${Math.round(ms)}ms`, 'info');
      } else {
        logToUi('Config: updateRateMs fehlt', 'warn');
      }
      continue;
    }

    if (type === 'packet') {
      const env = item as Partial<PacketEnvelope> & UnknownObject;
      const hop = (isObject(env.packet) ? env.packet : env) as HopPacketMessage;
      ingestHopPacket(hop);
      continue;
    }

    logToUi(`Unbekannter Nachrichtentyp (keys: ${Object.keys(item).join(', ')})`, 'warn');
  }
}

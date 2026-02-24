import React, { useEffect, useRef, useState } from 'react';
import TopBar from '../components/TopBar';
import TopologyCanvas from '../components/TopologyCanvas';
import DevicePalette from '../components/DevicePalette';
import RollingLog from '../components/RollingLog';
import TutorialOverlay from '../components/TutorialOverlay';
import { handleSmartdashMessage, logToUi } from '../sim/NetworkSimulator';
import { useTopologyStore } from '../model/useTopologyStore';

const PAUSE_EVENT = 'smartdash:pause';

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;

  return false;
}

function getGlobalPaused() {
  return Boolean((window as any).__smartdashPaused);
}

function setGlobalPaused(paused: boolean) {
  (window as any).__smartdashPaused = paused;
  window.dispatchEvent(new CustomEvent(PAUSE_EVENT, { detail: { paused } }));
}

function filterNonPacketMessagesDuringPause(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];

    const keep = arr.filter((x) => {
      if (!x || typeof x !== 'object') return false;
      const o = x as any;

      if (o.type === 'packet') return false;
      if (o.packet && typeof o.packet === 'object') return false;

      if (o.timestamp && o.sourceDeviceId && o.targetDeviceId && o.protocol) return false;

      return true;
    });

    if (keep.length === 0) return null;
    return JSON.stringify(keep.length === 1 ? keep[0] : keep);
  } catch {
    return null;
  }
}

const AppShell: React.FC = () => {
  const [showTutorial, setShowTutorial] = useState(false);
  const [isPaused, setIsPaused] = useState(() => getGlobalPaused());
  const packetSpeedPercent = useTopologyStore((s) => s.packetSpeedPercent);
  const setPacketSpeedPercent = useTopologyStore((s) => s.setPacketSpeedPercent);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const onPause = (e: Event) => {
      const paused = Boolean((e as CustomEvent).detail?.paused);
      setIsPaused(paused);
    };
    window.addEventListener(PAUSE_EVENT, onPause as any);
    return () => window.removeEventListener(PAUSE_EVENT, onPause as any);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;

    const wsOverride = new URLSearchParams(window.location.search).get('ws');
    const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const WS_URL = wsOverride ?? `ws://${host}:8765/packets`;

    let lastRawLogAt = 0;

    const forward = (text: string) => {
      if (!isPausedRef.current) {
        handleSmartdashMessage(text);
        return;
      }

      const forwarded = filterNonPacketMessagesDuringPause(text);
      if (forwarded) handleSmartdashMessage(forwarded);
    };

    const connect = () => {
      if (stopped) return;

      logToUi(`Verbinde WS: ${WS_URL}`);

      try {
        ws = new WebSocket(WS_URL);
      } catch {
        logToUi(`WS_URL ungültig: ${WS_URL}`);
        retry = window.setTimeout(connect, 3000);
        return;
      }

      ws.onopen = () => {
        logToUi('WS verbunden.');
        console.info('WS verbunden:', WS_URL);
      };

      ws.onmessage = (ev) => {
        const d: any = ev.data;

        const logRawThrottled = (s: string) => {
          const t = Date.now();
          if (t - lastRawLogAt >= 600) {
            lastRawLogAt = t;
            console.log('WS RAW:', s);
          }
        };

        if (typeof d === 'string') {
          logRawThrottled(d);
          forward(d);
          return;
        }

        if (d instanceof Blob) {
          d.text()
            .then((txt: string) => {
              logRawThrottled(txt);
              forward(txt);
            })
            .catch(() => {});
          return;
        }

        try {
          if (d instanceof ArrayBuffer) {
            const txt = new TextDecoder('utf-8').decode(new Uint8Array(d));
            logRawThrottled(txt);
            forward(txt);
            return;
          }

          if (ArrayBuffer.isView(d)) {
            const txt = new TextDecoder('utf-8').decode(d);
            logRawThrottled(txt);
            forward(txt);
            return;
          }
        } catch {}

        const fallback = String(d ?? '');
        logRawThrottled(fallback);
        forward(fallback);
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };

      ws.onclose = () => {
        if (stopped) return;
        logToUi('WS getrennt. Reconnect in 3s...');
        console.warn('WS getrennt. Reconnect in 3s...');
        retry = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      try {
        ws?.close();
      } catch {}
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSpace = e.code === 'Space' || e.key === ' ';
      if (!isSpace) return;
      if (isEditableTarget(e.target)) return;

      e.preventDefault();
      const next = !getGlobalPaused();
      setGlobalPaused(next);
      logToUi(next ? 'Pause aktiv.' : 'Fortsetzen.');
    };

    window.addEventListener('keydown', onKeyDown, { passive: false } as any);
    return () => window.removeEventListener('keydown', onKeyDown as any);
  }, []);

  const togglePause = () => {
    const next = !getGlobalPaused();
    setGlobalPaused(next);
    logToUi(next ? 'Pause aktiv.' : 'Fortsetzen.');
  };

  return (
    <div className="relative flex h-screen flex-col bg-gray-50">
      <header className="relative flex-shrink-0">
        <TopBar onShowTutorial={() => setShowTutorial(true)} />

        <div className="absolute right-14 top-17.5 z-20 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded bg-white/80 px-2 py-1 shadow">
            <span className="text-[11px] font-medium text-gray-700">Speed</span>
            <input
              aria-label="Packet speed"
              type="range"
              min={10}
              max={200}
              step={5}
              value={packetSpeedPercent}
              onChange={(e) => setPacketSpeedPercent(Number(e.target.value))}
              className="h-2 w-24"
              title="100% = normal, 200% = schneller, 50% = langsamer"
            />
            <span className="w-10 text-right text-[11px] tabular-nums text-gray-700">
              {packetSpeedPercent}%
            </span>
          </div>
          <button
            type="button"
            onClick={togglePause}
            className={`rounded px-3 py-1 text-sm font-semibold shadow ${
              isPaused ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
          >
            {isPaused ? 'Fortsetzen (Leertaste)' : 'Pause (Leertaste)'}
          </button>
        </div>
      </header>

      <main className="flex flex-grow overflow-hidden">
        <aside className="w-72 flex-shrink-0">
          <DevicePalette />
        </aside>

        <div className="relative flex-grow">
          <TopologyCanvas />

          <div className="absolute bottom-4 right-4 z-10 h-42 w-96">
            <RollingLog />
          </div>
        </div>
      </main>

      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}
    </div>
  );
};

export default AppShell;
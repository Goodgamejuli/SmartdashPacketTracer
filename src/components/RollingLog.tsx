import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTopologyStore, type LogEntry, type LogLevel } from '../model/useTopologyStore';

const levelMeta: Record<LogLevel, { icon: string; cls: string }> = {
  info: { icon: 'ℹ️', cls: 'text-slate-700' },
  success: { icon: '✅', cls: 'text-green-700' },
  warn: { icon: '⚠️', cls: 'text-amber-700' },
  error: { icon: '❌', cls: 'text-red-700' },
  wire: { icon: '📨', cls: 'text-blue-700' }, // Felix strings
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const MAX_LINES = 250;

const RollingLog: React.FC = () => {
  const logs = useTopologyStore((s) => s.logs);
  const clearLog = useTopologyStore((s) => s.clearLog);

  const safe = Array.isArray(logs) ? (logs as LogEntry[]) : [];

  // ✅ Live=true => immer oben
  // ✅ Live=false => Pause: garantiert NICHT mitscrollen
  const [live, setLive] = useState(true);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const prevRef = useRef<{ scrollHeight: number; scrollTop: number }>({ scrollHeight: 0, scrollTop: 0 });

  // Neueste oben
  const view = useMemo(() => safe.slice(-MAX_LINES).reverse(), [safe]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const prev = prevRef.current;
    const newH = box.scrollHeight;

    if (live) {
      box.scrollTop = 0;
    } else {
      // Pause: wenn oben neue Logs reinkommen (scrollHeight wächst),
      // scrollTop um delta erhöhen -> Viewport bleibt auf exakt gleicher Zeile.
      const delta = newH - prev.scrollHeight;
      if (delta !== 0) box.scrollTop = prev.scrollTop + delta;
    }

    prevRef.current = { scrollHeight: box.scrollHeight, scrollTop: box.scrollTop };
  }, [view.length, live]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-gray-300 bg-white/85 shadow">
      <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1">
        <div className="text-xs font-semibold text-slate-700">Log</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              live ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => {
              setLive((v) => !v);
              const box = boxRef.current;
              if (box && !live) box.scrollTop = 0;
            }}
            title={live ? 'Live: neueste oben' : 'Pause: kein Mitscrollen'}
          >
            {live ? '📌 Live' : '⏸ Pause'}
          </button>

          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => clearLog()}
            title="Log leeren"
          >
            🧹
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        className="flex-1 overflow-auto p-2 text-xs"
        role="log"
        aria-live="polite"
        onScroll={() => {
          const box = boxRef.current;
          if (!box) return;

          // User scrollt weg von oben => Pause automatisch aktivieren
          if (box.scrollTop > 4 && live) setLive(false);

          // In Pause: User-Position merken (damit Compensate exakt stimmt)
          if (!live) {
            prevRef.current = { scrollHeight: box.scrollHeight, scrollTop: box.scrollTop };
          }
        }}
      >
        {view.length === 0 ? (
          <div className="italic text-gray-500">Noch keine Meldungen.</div>
        ) : (
          view.map((l) => {
            const meta = levelMeta[l.level] ?? levelMeta.info;
            return (
              <div key={l.id} className="mb-1 flex gap-2 whitespace-pre-wrap">
                <div className="w-[68px] flex-shrink-0 font-mono text-[10px] text-slate-500">{fmtTime(l.ts)}</div>
                <div className="mt-[1px] w-6 flex-shrink-0 text-[12px]" title={l.level}>
                  {meta.icon}
                </div>
                <div className={`flex-1 ${meta.cls}`}>{l.text}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-gray-200 px-2 py-1 text-[10px] text-slate-500">
        Tipp: Scroll = Pause. Live pinnt neueste oben.
      </div>
    </div>
  );
};

export default RollingLog;

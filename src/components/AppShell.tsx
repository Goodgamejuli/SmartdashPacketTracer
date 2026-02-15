import React, { useEffect, useState } from 'react';
import TopBar from '../components/TopBar';
import TopologyCanvas from '../components/TopologyCanvas';
import DevicePalette from '../components/DevicePalette';
import RollingLog from '../components/RollingLog';
import TutorialOverlay from '../components/TutorialOverlay';
import { handleSmartdashMessage, logToUi } from '../sim/NetworkSimulator';

const AppShell: React.FC = () => {
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: number | null = null;
    let stopped = false;

    //WS Adresse 
    //const WS_URL = `ws://${window.location.hostname}:8765/packets`;
    const wsOverride = new URLSearchParams(window.location.search).get('ws');
    const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const WS_URL = wsOverride ?? `ws://${host}:8766/packets`;

    const connect = () => {
      if (stopped) return;

      logToUi(`Verbinde WS: ${WS_URL}`);

      try {
        ws = new WebSocket(WS_URL);
      } catch (err) {
        logToUi(`WS_URL ungültig: ${WS_URL}`);
        retry = window.setTimeout(connect, 3000);
        return;
      }

      ws.onopen = () => logToUi('WS verbunden.');
      ws.onmessage = (ev) => {
        console.log('WS RAW:', ev.data);          //zeigt 1:1 was ankommt
        handleSmartdashMessage(String(ev.data));
      };
      ws.onerror = () => {
        try { ws?.close(); } catch {}
      };
      ws.onclose = () => {
        if (stopped) return;
        logToUi('WS getrennt. Reconnect in 3s...');
        retry = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      try { ws?.close(); } catch {}
    };
  }, []);

  return (
    <div className="relative flex h-screen flex-col bg-gray-50">
      <header className="flex-shrink-0">
        <TopBar onShowTutorial={() => setShowTutorial(true)} />
      </header>

      <main className="flex flex-grow overflow-hidden">
        <aside className="w-72 flex-shrink-0">
          <DevicePalette />
        </aside>

        <div className="relative flex-grow">
          <TopologyCanvas />

          {/* Log unten rechts */}
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

SmartDash Packet Tracer - Setup

Das Frontend + der Paket Simulator lassen sich automatisch via start_windows.bat, auffindbar in diesem Verzeichnis, starten.

Wenn Python fehlt, lädt das Script den Python-Installer herunter und führt ihn aus.
Danach installiert es die benötigten Python- und Node-Abhängigkeiten und startet beide Teile des Projekts.
Beim ersten Start dauert es entsprechend länger.



#Dabei installiert bzw. startet es automatisch:

-Python 

-Python-Paket websockets 16.0

-Node.js

-npm Dependencies aus package.json (npm install)



#(start_linux.sh wird noch von Bruno & Benedikt konzipiert)



#manueller Start ohne .bat

Terminal 1: Python WebSocket-Simulator starten
cd "<PROJEKTROOT>/src/sim/Localhost"
py smartdash_transfer_ws.py

Terminal 2: Vite-Frontend starten
cd "<PROJEKTROOT>"
npm run dev -- --port 5173 --open



#Ordnerstruktur

src/

├── components/

│ ├── AppShell.tsx

│ ├── TopologyCanvas.tsx

│ ├── SmartDeviceNode.tsx

│ ├── ProtocolEdge.tsx

│ ├── DevicePalette.tsx

│ ├── PacketCanvasLayer

│ ├── TopBar.tsx

│ ├── RollingLog.tsx

│ └── TutorialOverlay.tsx

├── model/

│ ├── deviceTypes.ts

│ ├── protocols.ts

│ ├── schema.ts

│ └── useTopologyStore.ts

├── sim/

│ ├── NetworkSimulator.ts

│ ├── Localhost/

│ ├── smartdash_transfer_ws.py

│ └── start_smartdash_console.sh

├── App.tsx

├── main.tsx

└── index.css


Hinweis:

Um die Smarthome-Topologie zu öffnen, im UI oben rechts den "Laden"-Button betätigen & in den Projekt-Sourcefolder navigieren.
Folglich kann im Ordner "saves" die Topologie zum Öffnen gewählt werden.

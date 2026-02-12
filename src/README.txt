# SmartDash Packet Tracer - Setup

Dieses Projekt visualisiert Smart-Home-Netzwerkverkehr als Topologie. 
Das Frontend empfängt Traffic über WebSocket und rendert die Pakete live.
Um das Projekt starten zu können, müssen zuerst folgende Dependencies installiert werden:


---------------------------------------------------------------------------------------------------


# Dependencies installieren

# Voraussetzungen
- Node.js LTS installieren
- websockets 16.0
- Python 3.9+

Windows install:
winget install OpenJS.NodeJS.LTS -e --source winget; `
winget install Python.Python.3.11 -e --source winget; `
python -m pip install --upgrade pip; `
python -m pip install websockets==16.0


Unter Ubuntu / Debian Linux: 
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && \
sudo apt update && \
sudo apt install -y nodejs python3 python3-pip && \
python3 -m pip install --upgrade pip && \
python3 -m pip install websockets==16.0


---------------------------------------------------------------------------------------------------


Ordnerstruktur



src/

├── components/

│   ├── AppShell.tsx

│   ├── TopologyCanvas.tsx

│   ├── SmartDeviceNode.tsx

│   ├── ProtocolEdge.tsx

│   ├── DevicePalette.tsx

│   ├── TopBar.tsx

│   ├── RollingLog.tsx

│   └── TutorialOverlay.tsx

├── model/

│   ├── deviceTypes.ts

│   ├── protocols.ts

│   ├── schema.ts

│   └── useTopologyStore.ts

├── sim/

│   ├── NetworkSimulator.ts

│   └── Host Webserver/

│       ├── smartdash\_transfer\_ws.py

│       ├── requirements.txt

│       ├── start\_smartdash\_console.sh

│       └── Anleitung.docx

├── App.tsx

├── main.tsx

└── index.css


---------------------------------------------------------------------------------------------------


Aufsetzen nicht Git-inkludierter Abhängigkeiten - fällt weg wenn Projekt als ganzes übergeben wird
--> start der Start.bat im Projektverzeichnis genügt (öffnet zwei Terminals)

# Start in zwei Terminals

# Terminal 1: WebSocket-Simulator
```bash

cd "src/sim/Localhost"

python -m venv .venv

\# Windows:

.\\.venv\\Scripts\\activate

\# Linux/macOS:

\# source .venv/bin/activate



pip install -r requirements.txt

python smartdash\_transfer\_ws.py





\# Terminal 2: Frontend



Im Projektroot (dort liegt package.json)



npm install

npm run dev -- --port 5173 --open





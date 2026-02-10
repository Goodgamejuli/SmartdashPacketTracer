#### SmartDash Packet Tracer – Localhost Setup

Dieses Projekt visualisiert Smart-Home-Netzwerkverkehr als Topologie. Geräte erscheinen als Nodes. Verbindungen erscheinen als Kanten. Pakete laufen als animierte „Flights“ über die Kanten.

Das Frontend empfängt Traffic über WebSocket und rendert die Pakete live.


---------------------------------------------------------------------------------------------------


#### Schnellstart Localhost

#### Voraussetzungen
- Node.js LTS + npm
- Python 3.9+


---------------------------------------------------------------------------------------------------


Aufsetzen nicht Git-inkludierter Abhängigkeiten - fällt weg wenn Projekt als ganzes übergeben wird
--> start der start_windows.bat oder start_linux.sh im Projektverzeichnis genügt (öffnet zwei Terminals)

Script ausführbar machen:
chmod +x start_linux.sh
./start_linux.sh


#### Start in zwei Terminals

#### Terminal 1: WebSocket-Simulator
```bash
cd "src/sim/Localhost"
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python smartdash_transfer_ws.py


#### Terminal 2: Frontend

Im Projektroot (dort liegt package.json)

npm install
npm run dev -- --port 5173 --open


---------------------------------------------------------------------------------------------------


#### Ordnerstruktur

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
│       ├── smartdash_transfer_ws.py
│       ├── requirements.txt
│       ├── start_smartdash_console.sh
├── App.tsx
├── main.tsx
└── index.css


---------------------------------------------------------------------------------------------------


#### Funktionsüberblick

UI-Ablauf

Der Einstiegspunkt der Anwendung ist App.tsx, welches AppShell.tsx initialisiert. AppShell.tsx rendert das gesamte Layout und baut die WebSocket-Verbindung zum lokalen Simulator auf. Alle eingehenden WebSocket-Nachrichten werden an sim/NetworkSimulator.ts weitergeleitet. Dort erfolgt das Parsing der JSON-Daten sowie die Zuordnung der Nachrichten zu internen Ereignistypen. Anschließend werden die Daten in den globalen Zustand überführt.

Der zentrale Zustand liegt in model/useTopologyStore.ts. Er verwaltet Geräte, Verbindungen, Log-Einträge sowie aktive Paket-Animationen pro Verbindung. Zusätzlich speichert der Zustand TTL-Informationen global pro packetId, um Weiterleitungen über mehrere Hops korrekt abzubilden.

Interaktion im Canvas

Die Gerätepalette wird durch DevicePalette.tsx bereitgestellt und erlaubt das Platzieren neuer Geräte per Drag-and-Drop. Das eigentliche Canvas wird in TopologyCanvas.tsx umgesetzt und basiert auf XYFlow. Dort entstehen neue Geräte durch Ablegen im Canvas und neue Verbindungen durch das Verbinden von Handles. Existieren zwischen zwei Geräten mehrere kompatible Protokolle, öffnet sich ein Auswahl-Modal zur Protokollwahl. Bestehende Verbindungen können per Kontextmenü gelöscht oder – sofern möglich – auf ein anderes Protokoll umgestellt werden.

Die visuelle Darstellung der Verbindungen erfolgt in ProtocolEdge.tsx. Diese Komponente rendert das Protokoll-Label, animierte Pakete sowie ein TTL-Badge, das den verbleibenden Lebenszyklus eines Pakets anzeigt.

Logs

System-Ereignisse, Benutzeraktionen und WebSocket-Nachrichten werden zentral protokolliert. Die Anzeige erfolgt über RollingLog.tsx, das permanent unten rechts im UI eingeblendet ist und eine zeitliche Abfolge der Ereignisse darstellt.

Netzwerkverhalten und Matching-Regeln

Ein Paket wird im UI nur dann visualisiert, wenn eine passende Verbindung in der aktuellen Topologie existiert. Das Matching erfolgt zweistufig. Zunächst werden Quelle und Ziel des Pakets auf Geräte aufgelöst. Dabei dürfen sowohl Geräte-IDs als auch Geräte-Labels verwendet werden. Anschließend wird geprüft, ob zwischen diesen Geräten eine Verbindung existiert. Ist im Paket ein Protokoll angegeben, muss dieses exakt dem Protokoll der Verbindung entsprechen. Kann kein Match hergestellt werden, wird das Paket ohne Darstellung verworfen.

WebSocket-Nachrichtentypen

Das Frontend akzeptiert WebSocket-Nachrichten als JSON-Objekt oder als Array von Objekten. Unterstützt werden Log-Nachrichten zur Statusanzeige, Konfigurationsnachrichten zur Laufzeitsteuerung sowie Paket-Nachrichten zur Visualisierung von Netzwerkverkehr. Paket-Nachrichten können entweder direkt gesendet werden oder in einem Envelope mit type: "packet" eingebettet sein. Entscheidend ist, dass die Felder für Zeitstempel, Quelle, Ziel und Protokoll korrekt gesetzt sind.

TTL und packetId

Die TTL-Logik dient dazu, Pakete über mehrere Hops hinweg konsistent darzustellen. Der erste Hop eines Pakets übermittelt eine packetId zusammen mit einer ttlMs. Alle weiteren Hops senden ausschließlich dieselbe packetId. Das UI verwaltet daraus eine globale Ablaufzeit. Läuft die TTL ab, entfernt das System alle zugehörigen Paket-Animationen. Spätere Pakete mit derselben packetId werden ignoriert.

Wo wird der Traffic geändert?

Der synthetische Netzwerkverkehr wird ausschließlich im Python-Simulator definiert. Die relevante Datei ist src/sim/Host Webserver/smartdash_transfer_ws.py. Dort werden die Kommunikationspfade als Abfolge von Routen-Hops festgelegt. Jeder Hop beschreibt Quelle, Ziel, Protokoll und Laufzeit. Optional kann pro Hop eine eigene TTL gesetzt werden. Die verwendeten Protokollnamen müssen exakt den Einträgen in model/protocols.ts entsprechen. Quelle und Ziel müssen mit Geräte-IDs oder Labels aus der UI-Topologie übereinstimmen.



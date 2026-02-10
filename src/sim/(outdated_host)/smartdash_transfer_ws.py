#!/usr/bin/env python3
"""
smartdash_transfer_ws.py
WebSocket SERVER (Linux) für dein React UI (Windows)

Dein AppShell verbindet zu:
  ws://192.168.2.33:8765/packets

Dieses Script:
- startet einen WebSocket SERVER auf Linux: 0.0.0.0:8765
- akzeptiert den Pfad "/packets"
- sendet Log + Packet Messages an das UI

============================================================
WICHTIG: TTL "runterticken" über mehrere Hops (ohne Reset)
============================================================

Damit TTL NICHT pro Hop neu startet, nutzt das UI:
- packetId (gleiche ID über alle Hops)
- ttlMs nur optional

Regel:
- Beim ERSTEN Hop sendest du ttlMs (Start-TTL).
- Bei allen weiteren Hops lässt du ttlMs weg -> UI übernimmt Rest-TTL automatisch.

============================================================
ANLEITUNG: Eigene Route aus Topologie bauen
============================================================

1) Topologie im UI exportieren (JSON).
   - devices: [{ id, label, ... }]
   - edges:   [{ source, target, protocol, ... }]

2) Hop = genau eine Edge:
   src -> dst mit protocol.
   (IDs oder eindeutige Labels; IDs sind sicherer)

3) Erlaubte protocol-Keys (aus deinem UI):
   "WLAN", "ZigBee", "Homematic Proprietary (ZigBee)",
   "Bluetooth Low Energy", "DECT", "Ethernet"
"""

import asyncio
import json
import random
import time
from dataclasses import dataclass
from datetime import datetime

import websockets
from websockets.server import WebSocketServerProtocol


# =========================
# SERVER SETTINGS
# =========================
HOST = "0.0.0.0"
PORT = 8765

# Dein UI nutzt diesen Pfad:
ALLOWED_PATHS = {"/packets", "/"}

# ==========================================
# TIMING SETTINGS
# ==========================================
# Wie oft wir "eine neue Route" starten (0 = sofort wieder)
ROUTE_GAP_MS = 0

# Dieser Overlap sorgt dafür, dass die nächste Edge startet,
# bevor die vorherige wirklich "perfekt" fertig ist -> wirkt flüssiger.
OVERLAP_MS = 1800

# Wie oft wir kreative Logs schicken
SEND_LOG_EVERY_MS = 3000

# Start-TTL für ein komplettes Paket (über mehrere Hops).
# - None => es wird kein ttlMs gesendet (UI fällt dann auf Hop-Dauer-Logik zurück)
# - Zahl => ttlMs wird NUR beim ersten Hop gesendet, danach weggelassen.
ROUTE_TTL_MS = 9000


@dataclass(frozen=True)
class Hop:
    """Ein Hop = eine Kante im UI"""
    src: str
    dst: str
    protocol: str
    edge_travel_ms: int = 1600 # standard wenn nicht gesetzt 

    # Optional: Wenn du hier einen Wert setzt, wird ttlMs für DIESEN Hop gesendet.
    # Normalerweise lässt du das leer (None), damit TTL NICHT resetet.
    ttl_ms: int | None = None # standard wenn nicht gesetzt


# =========================
# ROUTE (HIER ANPASSEN)
# =========================
# Ersetze src/dst durch echte Device-IDs oder eindeutige Labels aus deiner Topologie.
ROUTE_HOPS: list[Hop] = [
    Hop("Bosch Bewegungssensor", "Bosch Smart Home Controller", "ZigBee", edge_travel_ms=4000, ttl_ms=5200),
    Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", edge_travel_ms=4000),
    Hop("PoE-Switch", "fritzbox", "Ethernet", edge_travel_ms=4000),
]


def iso_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def make_log(text: str, level: str = "info") -> dict:
    return {"type": "log", "level": level, "text": text}


def make_config(update_rate_ms: int) -> dict:
    return {"type": "config", "updateRateMs": update_rate_ms}


def make_packet(*, hop: Hop, packet_id: str, ttl_ms_to_send: int | None) -> dict:
    """
    ttl_ms_to_send:
      - None => Feld wird weggelassen -> UI nutzt verbleibende TTL über packetId
      - Zahl => wird gesendet -> UI setzt/überschreibt TTL-Start
    """
    packet: dict = {
        "timestamp": iso_now(),
        "sourceDeviceId": hop.src,
        "targetDeviceId": hop.dst,
        "protocol": hop.protocol,
        "edgeTravelMs": hop.edge_travel_ms,
        "packetId": packet_id,  # DAS ist der Schlüssel für TTL carry-over
        "messageType": "transfer_ws_server",
        "payload": {"story": "Sim läuft hop-by-hop durchs Netzwerk."},
    }

    if ttl_ms_to_send is not None:
        packet["ttlMs"] = int(ttl_ms_to_send)

    return {"type": "packet", "packet": packet}


async def loop_route_sender(ws: WebSocketServerProtocol):
    """
    Loop A (flüssig):
    - startet immer wieder eine komplette Route
    - erzeugt pro Route einen packetId
    - sendet Hops kaskadiert anhand edge_travel_ms (mit OVERLAP)
    - ttlMs wird NUR beim ersten Hop gesendet (ROUTE_TTL_MS), danach weggelassen
    """
    if not ROUTE_HOPS:
        await ws.send(json.dumps(make_log("ROUTE_HOPS ist leer – keine Packets werden gesendet.", "warn")))
        return

    await ws.send(json.dumps(make_log("🚚 Starte Route-Sender (flüssig, TTL carry-over via packetId).", "success")))
    await ws.send(json.dumps(make_config(ROUTE_HOPS[0].edge_travel_ms)))

    route_counter = 0

    while True:
        route_counter += 1
        packet_id = f"sim-{int(time.time()*1000)}-{route_counter}"

        # ttl nur am Start setzen:
        ttl_for_first_hop = ROUTE_TTL_MS

        for i, hop in enumerate(ROUTE_HOPS):
            # Falls du TTL bewusst reseten willst, könntest du hop.ttl_ms setzen.
            # Standard: None, damit es NICHT resetet.
            ttl_to_send: int | None

            if hop.ttl_ms is not None:
                ttl_to_send = hop.ttl_ms
            elif i == 0:
                ttl_to_send = ttl_for_first_hop
            else:
                ttl_to_send = None  # <-- entscheidend: NICHT senden => UI nimmt Rest-TTL

            await ws.send(json.dumps(make_packet(hop=hop, packet_id=packet_id, ttl_ms_to_send=ttl_to_send)))

            # Schlaf bis kurz vor Ende des Hops -> wirkt nahtlos
            sleep_ms = max(0, hop.edge_travel_ms - OVERLAP_MS)
            await asyncio.sleep(sleep_ms / 1000)

        if ROUTE_GAP_MS > 0:
            await asyncio.sleep(ROUTE_GAP_MS / 1000)


async def loop_fun_logs(ws: WebSocketServerProtocol):
    """Loop B: kreative Logs (unabhängig von Route)"""
    lines = [
        "Sim schaut kurz in den Briefkasten. 📬",
        "Sim winkt der Kamera zu. 👋",
        "Sim prüft, ob WLAN da ist. 📶",
        "Sim läuft zur Haustür und klingelt. 🔔",
        "Sim wartet – niemand öffnet. 🕒",
        "Sim läuft zurück zur Zentrale. 🏠",
    ]
    while True:
        await ws.send(json.dumps(make_log(random.choice(lines), "info")))
        await asyncio.sleep(SEND_LOG_EVERY_MS / 1000)


async def handler(ws: WebSocketServerProtocol):
    """
    Wird aufgerufen, sobald dein UI connected.
    """
    path = getattr(ws, "path", "/")
    if path not in ALLOWED_PATHS:
        await ws.close(code=1008, reason=f"Unsupported path {path}, use /packets")
        return

    await ws.send(json.dumps(make_log(f"✅ UI verbunden auf {path}.", "success")))

    # eingehende Messages ignorieren, aber Verbindung offen halten
    async def ignore_incoming():
        try:
            async for _ in ws:
                pass
        except Exception:
            pass

    await asyncio.gather(
        loop_route_sender(ws),
        loop_fun_logs(ws),
        ignore_incoming(),
    )


async def main():
    print(f"🟢 WebSocket SERVER läuft auf ws://{HOST}:{PORT}/packets")
    print("➡️ UI muss verbinden zu: ws://<LINUX-IP>:8765/packets")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()  # läuft für immer


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server gestoppt.")

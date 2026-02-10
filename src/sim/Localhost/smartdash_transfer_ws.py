#!/usr/bin/env python3
"""
smartdash_transfer_ws.py
Öffnet WebSocket für das React UI

UI verbindet typischerweise zu:
  ws://localhost:8765/packets

Dieses Script:
- startet einen WebSocket SERVER auf 127.0.0.1:8765
- akzeptiert den Pfad "/packets"
- sendet Log + Packet Messages an das UI



- update_rate_ms = Brief-Sendefrequenz (Injektionsrate) pro Route

Message-Formate:
  { "type": "log", ... }
  { "type": "packet", "packet": { ... } }

Optionale Kontrolle:
  { "type": "startRoute", "route": { ... } }
  { "type": "stopRoute",  "routeId": "..." }
  { "type": "listRoutes" }


  
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
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol

# =========================
# SERVER SETTINGS
# =========================
HOST = "0.0.0.0"
PORT = 8765
ALLOWED_PATHS = {"/packets", "/"}

# =========================
# LOG SETTINGS
# =========================
SEND_LOG_EVERY_MS = 3000

# =========================
# ROUTE / PACKET SETTINGS
# =========================
DEFAULT_ROUTE_TTL_MS = 9000

# Wie stark Hops "überlappen" sollen, damit ein Brief gefühlt nahtlos weiterfliegt
# 0 = strikt nacheinander, >0 = nächster Hop startet etwas früher
DEFAULT_HOP_OVERLAP_MS = 250 


@dataclass(frozen=True)
class Hop:
    src: str
    dst: str
    protocol: str
    edge_travel_ms: int = 1600
    ttl_ms: int | None = None


@dataclass(frozen=True)
class Route:
    route_id: str
    hops: list[Hop]

    # Brief-Sendefrequenz
    update_rate_ms: int = 250

    # optionale Pause zwischen Briefstarts (zusätzlich zur update_rate_ms)
    extra_gap_ms: int = 0

    # TTL nur beim ersten Hop senden (pro Brief)
    ttl_ms: int | None = DEFAULT_ROUTE_TTL_MS

    # wie früh der nächste Hop für denselben Brief startet (optische "Nahtlosigkeit")
    hop_overlap_ms: int = DEFAULT_HOP_OVERLAP_MS

    # optional: Startverzögerung beim Connect
    start_delay_ms: int = 0


# =========================
# DEFAULT ROUTES (manuelle Erweiterung anhand von exportierter Topologie Datei möglich - siehe Anleitung oben - device- ids oder labels können verwendet werden aus der Topo)
# =========================
DEFAULT_ROUTES: list[Route] = [
    Route(
        route_id="route-bosch-core",
        update_rate_ms=220,  # Brief-Strom (kleiner = mehr Briefe)
        ttl_ms=3900,
        hop_overlap_ms=2000,
        hops=[
            Hop("Bosch Bewegungssensor", "Bosch Smart Home Controller", "ZigBee", edge_travel_ms=4000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", edge_travel_ms=4000),
            Hop("PoE-Switch", "fritzbox", "Ethernet", edge_travel_ms=4000),
        ],
    ),
    
    Route(
        route_id="route-alt-1",
        update_rate_ms=350,
        ttl_ms=1000,
        hop_overlap_ms=2000,
        start_delay_ms=700,  # leicht versetzt starten
        hops=[
            Hop("fritzbox", "PoE-Switch", "Ethernet", edge_travel_ms=3200),
            Hop("PoE-Switch", "Bosch Smart Home Controller", "Ethernet", edge_travel_ms=3200),
        ],
    ),
]

# routeId identifiziert einen logischen Briefstrom (eine Route). (können auch zu beliebigem Zeitpunkt über stoproute() beendet werden per routeId)
# Alle Briefe einer Route teilen sich dieselbe routeId, aber haben unterschiedliche packetId
# Die routeId dient der Gruppierung, Steuerung (start/stop) und Auswertung paralleler Routen
# Sie beeinflusst nicht das Routing selbst und kann frei, aber eindeutig gewählt werden

def iso_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def make_log(text: str, level: str = "info") -> dict:
    return {"type": "log", "level": level, "text": text}


def make_packet_message(*, hop: Hop, packet_id: str, ttl_ms_to_send: int | None, route_id: str) -> dict:
    packet: dict[str, Any] = {
        "timestamp": iso_now(),
        "sourceDeviceId": hop.src,
        "targetDeviceId": hop.dst,
        "protocol": hop.protocol,
        "edgeTravelMs": hop.edge_travel_ms,
        "packetId": packet_id,
        "routeId": route_id,
        "messageType": "transfer_ws_server_v2",
        "payload": {"story": "Sim läuft als Briefstrom über Route/Hops."},
    }
    if ttl_ms_to_send is not None:
        packet["ttlMs"] = int(ttl_ms_to_send)

    return {"type": "packet", "packet": packet}


async def safe_send_json(ws: WebSocketServerProtocol, send_lock: asyncio.Lock, obj: dict):
    # websockets send() darf nicht parallel aus mehreren Tasks laufen (Lock)
    msg = json.dumps(obj, ensure_ascii=False)
    async with send_lock:
        await ws.send(msg)


async def run_single_packet_over_route(
    *,
    ws: WebSocketServerProtocol,
    send_lock: asyncio.Lock,
    route: Route,
    packet_id: str,
):
    """
    Ein "Brief" (= packet_id) läuft über alle Hops.
    """
    if not route.hops:
        return

    # TTL nur beim ersten Hop (pro Brief) & danach None (carry-over über packetId)
    ttl_first = route.ttl_ms

    for i, hop in enumerate(route.hops):
        ttl_to_send: int | None
        if hop.ttl_ms is not None:
            ttl_to_send = hop.ttl_ms
        elif i == 0:
            ttl_to_send = ttl_first
        else:
            ttl_to_send = None

        await safe_send_json(
            ws,
            send_lock,
            make_packet_message(hop=hop, packet_id=packet_id, ttl_ms_to_send=ttl_to_send, route_id=route.route_id),
        )

        # Nahtlosigkeit: nächster Hop startet etwas früher
        sleep_ms = max(0, hop.edge_travel_ms - route.hop_overlap_ms)
        await asyncio.sleep(sleep_ms / 1000.0)


async def route_injector_loop(
    *,
    ws: WebSocketServerProtocol,
    send_lock: asyncio.Lock,
    route: Route,
    stop_event: asyncio.Event,
):
    """
    update_rate_ms bestimmt die Brief-Sendefrequenz:
    - alle update_rate_ms wird ein neuer Brief (neue packet_id) gestartet
    - jeder Brief läuft in eigenem Task über die Hops
    => mehrere Briefe gleichzeitig auf derselben Edge entstehen automatisch, wenn:
       edge_travel_ms > update_rate_ms
    """
    if route.start_delay_ms > 0:
        await asyncio.sleep(route.start_delay_ms / 1000.0)

 

    seq = 0
    in_flight: set[asyncio.Task] = set()

    try:
        while not stop_event.is_set():
            seq += 1
            packet_id = f"{route.route_id}-{int(time.time()*1000)}-{seq}"

            task = asyncio.create_task(
                run_single_packet_over_route(ws=ws, send_lock=send_lock, route=route, packet_id=packet_id)
            )
            in_flight.add(task)
            task.add_done_callback(lambda t: in_flight.discard(t))

            # Injektionsrate = update_rate_ms
            await asyncio.sleep(max(1, route.update_rate_ms) / 1000.0)

            if route.extra_gap_ms > 0:
                await asyncio.sleep(route.extra_gap_ms / 1000.0)

    finally:
        # sauber stoppen: laufende Tasks canceln
        for t in list(in_flight):
            t.cancel()
        await safe_send_json(ws, send_lock, make_log(f"⏹️ Route '{route.route_id}' gestoppt.", "warn"))


async def loop_fun_logs(ws: WebSocketServerProtocol, send_lock: asyncio.Lock, stop_event: asyncio.Event):
    lines = [
        "Sim schaut kurz in den Briefkasten. 📬",
        "Sim prüft, ob WLAN da ist. 📶",
        "Sim läuft zur Haustür und klingelt. 🔔",
        "Sim wartet – niemand öffnet. 🕒",
        "Sim läuft zurück zur Zentrale. 🏠",
        "Sim verteilt Post im Netzwerk. ✉️",
    ]
    while not stop_event.is_set():
        await safe_send_json(ws, send_lock, make_log(random.choice(lines), "info"))
        await asyncio.sleep(SEND_LOG_EVERY_MS / 1000.0)


def parse_route_from_client(obj: dict) -> Route:
    """
    Erwartetes Format:
    {
      "type":"startRoute",
      "route":{
        "routeId":"r1",
        "updateRateMs":200,
        "ttlMs":9000,
        "hopOverlapMs":250,
        "hops":[{"src":"A","dst":"B","protocol":"Ethernet","edgeTravelMs":1200}, ...]
      }
    }
    """
    r = obj.get("route") or {}
    route_id = str(r.get("routeId") or f"client-{int(time.time()*1000)}")
    update_rate_ms = int(r.get("updateRateMs") or 250)
    ttl_ms = r.get("ttlMs")
    ttl_ms = int(ttl_ms) if ttl_ms is not None else None
    hop_overlap_ms = int(r.get("hopOverlapMs") or DEFAULT_HOP_OVERLAP_MS)

    hops_in = r.get("hops") or []
    hops: list[Hop] = []
    for h in hops_in:
        hops.append(
            Hop(
                src=str(h.get("src")),
                dst=str(h.get("dst")),
                protocol=str(h.get("protocol")),
                edge_travel_ms=int(h.get("edgeTravelMs") or 1600),
                ttl_ms=int(h["ttlMs"]) if "ttlMs" in h and h["ttlMs"] is not None else None,
            )
        )

    return Route(
        route_id=route_id,
        update_rate_ms=max(10, update_rate_ms),
        ttl_ms=ttl_ms,
        hop_overlap_ms=max(0, hop_overlap_ms),
        hops=hops,
    )


async def handler(ws: WebSocketServerProtocol):
    path = getattr(ws, "path", "/")
    if path not in ALLOWED_PATHS:
        await ws.close(code=1008, reason=f"Unsupported path {path}, use /packets")
        return

    send_lock = asyncio.Lock()
    stop_all = asyncio.Event()

    await safe_send_json(ws, send_lock, make_log(f"✅ UI verbunden auf {path}.", "success"))

    # aktive Routen: route_id -> (stop_event, task)
    active_routes: dict[str, tuple[asyncio.Event, asyncio.Task]] = {}

    def start_route(route: Route):
        if route.route_id in active_routes:
            return
        ev = asyncio.Event()
        t = asyncio.create_task(route_injector_loop(ws=ws, send_lock=send_lock, route=route, stop_event=ev))
        active_routes[route.route_id] = (ev, t)

    async def stop_route(route_id: str):
        entry = active_routes.get(route_id)
        if not entry:
            await safe_send_json(ws, send_lock, make_log(f"⚠️ Route '{route_id}' nicht aktiv.", "warn"))
            return
        ev, t = entry
        ev.set()
        t.cancel()
        active_routes.pop(route_id, None)

    # Default-Routen automatisch starten (mehrere simultan)
    for r in DEFAULT_ROUTES:
        start_route(r)

    # Logs parallel
    fun_logs_task = asyncio.create_task(loop_fun_logs(ws, send_lock, stop_all))

    # Incoming Control (optional)
    try:
        async for msg in ws:
            try:
                obj = json.loads(msg)
            except Exception:
                continue

            msg_type = obj.get("type")
            if msg_type == "startRoute":
                try:
                    r = parse_route_from_client(obj)
                    if not r.hops:
                        await safe_send_json(ws, send_lock, make_log("⚠️ startRoute: hops leer.", "warn"))
                        continue
                    start_route(r)
                    await safe_send_json(ws, send_lock, make_log(f"✅ startRoute: '{r.route_id}' gestartet.", "success"))
                except Exception as e:
                    await safe_send_json(ws, send_lock, make_log(f"❌ startRoute Fehler: {e}", "error"))

            elif msg_type == "stopRoute":
                rid = str(obj.get("routeId") or "")
                if rid:
                    await stop_route(rid)

            elif msg_type == "listRoutes":
                ids = ", ".join(active_routes.keys()) if active_routes else "(keine)"
                await safe_send_json(ws, send_lock, make_log(f"📌 Aktive Routen: {ids}", "info"))

            else:
                # unbekannt/ignorieren
                pass

    except Exception:
        pass
    finally:
        stop_all.set()
        try:
            fun_logs_task.cancel()
        except Exception:
            pass

        # alle routes stoppen
        for rid in list(active_routes.keys()):
            await stop_route(rid)

async def main():
    print(f"🟢 WebSocket SERVER läuft auf ws://{HOST}:{PORT}/packets")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server gestoppt.")

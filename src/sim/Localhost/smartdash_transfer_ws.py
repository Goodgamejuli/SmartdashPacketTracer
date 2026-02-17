#!/usr/bin/env python3
"""
smartdash_transfer_ws.py
WebSocket SERVER (Linux/Windows) für dein React UI.

UI verbindet zu:
  ws://127.0.0.1:8765/packets

Dieses Script:
- startet einen WebSocket SERVER auf 0.0.0.0:8765
- akzeptiert die Pfade "/packets" und "/"
- sendet Log + Packet Messages an das UI

Zusatz:
- RAW Logging im Terminal (wie TapProxy)
  [SIM→UI] und [UI→SIM] exakt als Textframe
  [CONNECT] / [CLOSE] / [READY]
"""

import asyncio
import json
import random
import time
from dataclasses import dataclass
from datetime import datetime


import websockets


# =========================
# SERVER SETTINGS
# =========================
HOST = "0.0.0.0"
PORT = 8765
ALLOWED_PATHS = {"/packets", "/"}

# ==========================================
# TIMING SETTINGS
# ==========================================
OVERLAP_MS = 120
SEND_LOG_EVERY_MS = 3000
ROUTE_TTL_MS = 9000 # default wenn nicht spezifiziert

# Demo: alle 2s Paket-Status ändern
DEMO_COMMAND_EVERY_S = 2.0


# =========================
# RAW LOGGING
# =========================
def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def raw_log(direction: str, payload):
    if isinstance(payload, bytes):
        print(f"{ts()} {direction} <binary {len(payload)} bytes>", flush=True)
        return
    print(f"{ts()} {direction} {payload}", flush=True)


async def send_text(ws, text: str):
    raw_log("[SIM→UI]", text)

    lock = getattr(ws, "sd_send_lock", None)
    if lock is None:
        await ws.send(text)
        return

    async with lock:
        await ws.send(text)


async def send_obj(ws, obj: dict):
    msg = json.dumps(obj, ensure_ascii=False)
    await send_text(ws, msg)


def iso_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def make_log(text: str, level: str = "info") -> dict:
    return {"type": "log", "level": level, "text": text}


def make_config(update_rate_ms: int) -> dict:
    return {"type": "config", "updateRateMs": update_rate_ms}

def make_route_status(route_id: int, status: str) -> dict:
    return {
        "type": "routeStatus",
        "routeId": int(route_id),
        "status": str(status),
        "timestamp": iso_now(),
    }

# =========================
# DATA MODEL
# =========================
@dataclass(frozen=True)
class Hop:
    src: str
    dst: str
    protocol: str
    edge_travel_ms: int = 1600
    ttl_ms: int | None = None


@dataclass(frozen=True)
class StatusStep:
    """
    Ein Step in der Route: status + optionaler alert.
    """
    status: str
    alert: dict | None = None


@dataclass
@dataclass
class RouteRuntime:
    """
    Route = hops + steps + runtime state.
    Status wird NUR per Befehl gesetzt (kein Auto-Switch).
    """
    route_id: int
    name: str

    hops: list[Hop]
    steps: list[StatusStep]

    # Paketfrequenz: Pause NACH einem End-to-End Paket
    packet_gap_ms: int = 400

    # runtime
    step_index: int = 0

    def snapshot(self) -> tuple[StatusStep, int, int]:
        if not self.steps:
            return (StatusStep(status=""), 0, 0)

        total = len(self.steps)
        idx = 0 if total == 1 else (self.step_index % total)
        return (self.steps[idx], idx, total)

    def set_step_by_status(self, status: str) -> bool:
        s = (status or "").strip()
        if not s or not self.steps:
            return False

        for i, st in enumerate(self.steps):
            if st.status == s:
                self.step_index = i
                return True

        return False


def _default_alarm_alert(code: str, message: str, severity: str = "warn") -> dict:
    return {"kind": "alarm", "severity": severity, "code": code, "message": message}


# =========================
# ROUTES --- DESIGN ---
# =========================
ROUTES: list[RouteRuntime] = [
        RouteRuntime(
        route_id=1,
        name="Bosch Funksteckdose -> Bosch Server",
        hops=[
            Hop("Bosch Funksteckdose", "Bosch Smart Home Controller", "ZigBee", edge_travel_ms=1600, ttl_ms=10200),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", edge_travel_ms=1600),
            Hop("PoE-Switch", "Bosch Server", "Ethernet", edge_travel_ms=1600),
        ],
        steps=[
            StatusStep("bosch.funksteckdose.status"),
        ],
        packet_gap_ms=400, 
    ),
    RouteRuntime(
        route_id=2,
        name="Bosch Wassersensor -> Bosch Server",
        hops=[
            Hop("Bosch Wassersensor", "Bosch Smart Home Controller", "ZigBee", edge_travel_ms=1600, ttl_ms=10200),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", edge_travel_ms=1600),
            Hop("PoE-Switch", "Bosch Server", "Ethernet", edge_travel_ms=1600),
        ],
        steps=[
            StatusStep("bosch.wassersensor.status"),
            StatusStep("bosch.wassersensor.alarm"),
        ],
        packet_gap_ms=400,
    ),
    RouteRuntime( #BLE Protokoll funktioniert noch nicht
        route_id=3,
        name="Garmin Watch -> Fritzbox",
        hops=[
            Hop("abus_lock", "Pixel 7a", "Bluetooth Low Energy", edge_travel_ms=1600, ttl_ms=10500),
            Hop("Pixel 7a", "fritzbox", "WLAN", edge_travel_ms=1600),
        ],
        steps=[
            StatusStep("bosch.wassersensor.status"),
            StatusStep("bosch.wassersensor.alarm"),
        ],
        packet_gap_ms=400,
    ),
    RouteRuntime(
        route_id=4,
        name="Garmin Watch -> Fritzbox",
        hops=[
            Hop("hama_camera", "wifi_hub", "WLAN", edge_travel_ms=3000, ttl_ms=6500),
            Hop("wifi_hub", "fritzbox", "Ethernet", edge_travel_ms=3000, ttl_ms=6500),
        ],
        steps=[
            StatusStep("bosch.wassersensor.status"),
            StatusStep("bosch.wassersensor.alarm"),
        ],
        packet_gap_ms=400,
    ),
]

""" Protokollübersicht für Routen
export const PROTOCOL_WLAN: Protocol = 'WLAN';
export const PROTOCOL_ZIGBEE: Protocol = 'ZigBee';
export const PROTOCOL_HOMEMATIC_PROPRIETARY: Protocol = 'Homematic Proprietary (ZigBee)';
export const PROTOCOL_BLE: Protocol = 'Bluetooth Low Energy'; --- noch nicht funktional ---
export const PROTOCOL_DECT: Protocol = 'DECT';
export const PROTOCOL_ETHERNET: Protocol = 'Ethernet';
"""


ROUTE_BY_ID: dict[int, RouteRuntime] = {r.route_id: r for r in ROUTES}


# =========================
# PACKET BUILD
# =========================
def make_packet(*, hop: Hop, packet_id: str, ttl_ms_to_send: int | None) -> dict:
    packet: dict = {
        "timestamp": iso_now(),
        "sourceDeviceId": hop.src,
        "targetDeviceId": hop.dst,

        # kompatibel zu PacketLike-Parser (beides wird akzeptiert)
        "source": hop.src,
        "target": hop.dst,

        "protocol": hop.protocol,
        "edgeTravelMs": hop.edge_travel_ms,
        "durationMs": hop.edge_travel_ms,

        "packetId": packet_id,
        "messageType": "transfer_ws_server",
    }

    if ttl_ms_to_send is not None:
        packet["ttlMs"] = int(ttl_ms_to_send)

    return {"type": "packet", "packet": packet}

def make_packet_with_route(
    *,
    hop: Hop,
    packet_id: str,
    ttl_ms_to_send: int | None,
    route: RouteRuntime,
    step: StatusStep,
    step_index: int,
    step_total: int,
) -> dict:
    msg = make_packet(hop=hop, packet_id=packet_id, ttl_ms_to_send=ttl_ms_to_send)
    packet = msg.get("packet")

    if not isinstance(packet, dict):
        return msg

    payload = packet.get("payload")
    if not isinstance(payload, dict):
        payload = {}
        packet["payload"] = payload

    payload["routeId"] = int(route.route_id)
    payload["routeName"] = route.name
    payload["status"] = str(step.status)
    payload["statusIndex"] = int(step_index)
    payload["statusTotal"] = int(step_total)

    if step.alert is not None:
        payload["alert"] = step.alert

    return msg

async def send_one_packet_sequence(ws, route: RouteRuntime, packet_id: str, step: StatusStep, idx: int, total: int):
    ttl_for_first_hop = ROUTE_TTL_MS

    for i, hop in enumerate(route.hops):
        if hop.ttl_ms is not None:
            ttl_to_send = hop.ttl_ms
        elif i == 0:
            ttl_to_send = ttl_for_first_hop
        else:
            ttl_to_send = None

        await send_obj(
            ws,
            make_packet_with_route(
                hop=hop,
                packet_id=packet_id,
                ttl_ms_to_send=ttl_to_send,
                route=route,
                step=step,
                step_index=idx,
                step_total=total,
            ),
        )
        await asyncio.sleep(max(0, hop.edge_travel_ms) / 1000)

async def loop_route_sender(ws, route: RouteRuntime):
    if not route.hops:
        await send_obj(ws, make_log(f"Route {route.route_id} hat keine Hops – keine Packets.", "warn"))
        return

    await send_obj(ws, make_log(f"🚚 Starte Route-Sender {route.route_id}.", "success"))

    seq = 0
    try:
        while True:
            seq += 1
            packet_id = f"sim-r{route.route_id}-{int(time.time()*1000)}-{seq}"

            step, idx, total = route.snapshot()
            await send_one_packet_sequence(ws, route, packet_id, step, idx, total)

            gap_ms = max(10, int(route.packet_gap_ms))
            await asyncio.sleep(gap_ms / 1000)

    except Exception as e:
        print(f"{ts()} [ROUTE-END r{route.route_id}] {e!r}", flush=True)

# =========================
# ROUTE CONTROLBEREICH --- Status umschalten ---
# =========================
class RouteControl:
    def __init__(self, route_by_id: dict[int, RouteRuntime]):
        self.routes = route_by_id

    def _get(self, route_id: int) -> RouteRuntime | None:
        try:
            return self.routes.get(int(route_id))
        except Exception:
            return None

    def set_status(self, route_id: int, status: str) -> bool:
        r = self._get(route_id)
        if not r:
            return False
        return r.set_step_by_status(status)

async def demo_control_loop(rc: RouteControl, ws):
    """
    Demo: Statuswechsel laufen parallel.
    Jede Route hat ihren eigenen Loop und schaltet unabhängig um.
    """

    async def set_and_wait(route_id: int, status: str):
        ok = rc.set_status(route_id, status)

        # optional: Log (bei Bedarf einkommentieren)
        # await send_obj(ws, make_log(f"[DEMO] routeId={route_id} status={status} ok={ok}", "info"))

        # optional: Live-Update fürs Frontend (damit bereits laufende Pakete live umschalten)
        if ok:
            await send_obj(ws, make_route_status(route_id, status))

        await asyncio.sleep(DEMO_COMMAND_EVERY_S)

    async def loop_route_1():
        while True:
            # Route 1 (nur 1 Status)
            await set_and_wait(1, "bosch.funksteckdose.status")

    async def loop_route_2():
        while True:
            # Route 2 normal
            await set_and_wait(2, "bosch.wassersensor.status")
            # Route 2 Alarm
            await set_and_wait(2, "bosch.wassersensor.alarm")

    async def loop_route_3():
        while True:
            # Route 3 normal
            await set_and_wait(3, "bosch.wassersensor.status")
            # Route 3 Alarm
            await set_and_wait(3, "bosch.wassersensor.alarm")

    async def loop_route_4():
        while True:
            # Route 4 normal
            await set_and_wait(4, "bosch.wassersensor.status")
            # Route 4 Alarm
            await set_and_wait(4, "bosch.wassersensor.alarm")

    tasks = [
        asyncio.create_task(loop_route_1()),
        asyncio.create_task(loop_route_2()),
        asyncio.create_task(loop_route_3()),
        asyncio.create_task(loop_route_4()),
    ]

    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for t in tasks:
            t.cancel()
        return


async def loop_fun_logs(ws):
    lines = [
        "Sim schaut kurz in den Briefkasten. 📬",
        "Sim winkt der Kamera zu. 👋",
        "Sim prüft, ob WLAN da ist. 📶",
        "Sim läuft zur Haustür und klingelt. 🔔",
        "Sim wartet – niemand öffnet. 🕒",
        "Sim läuft zurück zur Zentrale. 🏠",
    ]

    try:
        while True:
            await send_obj(ws, make_log(random.choice(lines), "info"))
            await asyncio.sleep(SEND_LOG_EVERY_MS / 1000)
    except Exception as e:
        print(f"{ts()} [LOG-END] {e!r}", flush=True)


async def handler(ws):
    path = getattr(ws, "path", "/")
    peer = getattr(ws, "remote_address", None)

    print(f"{ts()} [CONNECT] UI connected, peer={peer}, path={path}", flush=True)

    if path not in ALLOWED_PATHS:
        await ws.close(code=1008, reason=f"Unsupported path {path}, use /packets")
        print(f"{ts()} [CLOSE] rejected path={path}", flush=True)
        return

    await send_obj(ws, make_log(f"✅ UI verbunden auf {path}.", "success"))

    ws.sd_send_lock = asyncio.Lock()

    # Config: erstes hop travel als baseline
    first_hop_ms = ROUTES[0].hops[0].edge_travel_ms if ROUTES and ROUTES[0].hops else 120
    await send_obj(ws, make_config(first_hop_ms))

    rc = RouteControl(ROUTE_BY_ID)

    demo_task = asyncio.create_task(demo_control_loop(rc, ws))
    route_tasks = [asyncio.create_task(loop_route_sender(ws, r)) for r in ROUTES]

    try:
        await asyncio.gather(loop_fun_logs(ws), *route_tasks)
    finally:
        demo_task.cancel()
        for t in route_tasks:
            t.cancel()
        print(f"{ts()} [CLOSE] UI disconnected, peer={peer}", flush=True)


async def main():
    print(f"🟢 WebSocket SERVER läuft auf ws://{HOST}:{PORT}/packets", flush=True)
    print(f"{ts()} [READY] waiting for UI connections...", flush=True)
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server gestoppt.", flush=True)

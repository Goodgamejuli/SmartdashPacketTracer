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
ROUTE_GAP_MS = 0
OVERLAP_MS = 1800
SEND_LOG_EVERY_MS = 3000
ROUTE_TTL_MS = 9000


# =========================
# RAW LOGGING (TapProxy-Style)
# =========================
def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]

def raw_log(direction: str, payload):
    # 1:1 anzeigen: Text unverändert ausgeben
    if isinstance(payload, bytes):
        print(f"{ts()} {direction} <binary {len(payload)} bytes>", flush=True)
        return
    print(f"{ts()} {direction} {payload}", flush=True)

async def send_text(ws, text: str):
    raw_log("[SIM→UI]", text)
    await ws.send(text)

async def send_obj(ws, obj: dict):
    msg = json.dumps(obj, ensure_ascii=False)
    await send_text(ws, msg)


@dataclass(frozen=True)
class Hop:
    src: str
    dst: str
    protocol: str
    edge_travel_ms: int = 1600
    ttl_ms: int | None = None


# =========================
# ROUTE (HIER ANPASSEN)
# =========================
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
    packet: dict = {
        "timestamp": iso_now(),
        "sourceDeviceId": hop.src,
        "targetDeviceId": hop.dst,
        "protocol": hop.protocol,
        "edgeTravelMs": hop.edge_travel_ms,
        "packetId": packet_id,
        "messageType": "transfer_ws_server",
        "payload": {"story": "Sim läuft hop-by-hop durchs Netzwerk."},
    }
    if ttl_ms_to_send is not None:
        packet["ttlMs"] = int(ttl_ms_to_send)
    return {"type": "packet", "packet": packet}


async def loop_route_sender(ws):
    if not ROUTE_HOPS:
        await send_obj(ws, make_log("ROUTE_HOPS ist leer – keine Packets werden gesendet.", "warn"))
        return

    await send_obj(ws, make_log("🚚 Starte Route-Sender (TTL carry-over via packetId).", "success"))
    await send_obj(ws, make_config(ROUTE_HOPS[0].edge_travel_ms))

    route_counter = 0

    try:
        while True:
            route_counter += 1
            packet_id = f"sim-{int(time.time()*1000)}-{route_counter}"

            ttl_for_first_hop = ROUTE_TTL_MS

            for i, hop in enumerate(ROUTE_HOPS):
                if hop.ttl_ms is not None:
                    ttl_to_send = hop.ttl_ms
                elif i == 0:
                    ttl_to_send = ttl_for_first_hop
                else:
                    ttl_to_send = None

                await send_obj(ws, make_packet(hop=hop, packet_id=packet_id, ttl_ms_to_send=ttl_to_send))

                sleep_ms = max(0, hop.edge_travel_ms - OVERLAP_MS)
                await asyncio.sleep(sleep_ms / 1000)

            if ROUTE_GAP_MS > 0:
                await asyncio.sleep(ROUTE_GAP_MS / 1000)

    except Exception as e:
        print(f"{ts()} [ROUTE-END] {e!r}", flush=True)


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


async def recv_logger(ws):
    # UI sendet oft nichts. Falls doch, siehst du es hier 1:1.
    try:
        async for msg in ws:
            raw_log("[UI→SIM]", msg)
    except Exception as e:
        print(f"{ts()} [RECV-END] {e!r}", flush=True)


async def handler(ws):
    path = getattr(ws, "path", "/")
    peer = getattr(ws, "remote_address", None)

    print(f"{ts()} [CONNECT] UI connected, peer={peer}, path={path}", flush=True)

    if path not in ALLOWED_PATHS:
        await ws.close(code=1008, reason=f"Unsupported path {path}, use /packets")
        print(f"{ts()} [CLOSE] rejected path={path}", flush=True)
        return

    await send_obj(ws, make_log(f"✅ UI verbunden auf {path}.", "success"))

    recv_task = asyncio.create_task(recv_logger(ws))
    try:
        await asyncio.gather(
            loop_route_sender(ws),
            loop_fun_logs(ws),
        )
    finally:
        recv_task.cancel()
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

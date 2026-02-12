#!/usr/bin/env python3
"""
ws_tap_proxy.py

WebSocket-Proxy zum Mitloggen des Datenverkehrs.
Die Ausgabe zeigt die Rohdaten so, wie sie tatsächlich als Textframe über WebSocket laufen.

Rollen:
- Downstream: SmartDash UI verbindet zu diesem Proxy.
- Upstream: Proxy verbindet zum eigentlichen Simulator-Server.

Standard:
- Proxy lauscht auf: ws://127.0.0.1:8766/packets
- Proxy verbindet zu: ws://127.0.0.1:8765/packets

Hinweis:
- Der Proxy verändert keine Payload.
- Der Proxy druckt jede Nachricht 1:1 als RAW-String.

Konfiguration per ENV:
- LISTEN_HOST (default 127.0.0.1)
- LISTEN_PORT (default 8766)
- UPSTREAM_URL (default ws://127.0.0.1:8765/packets)
"""

import asyncio
import os
from datetime import datetime

import websockets

try:
    from websockets.server import WebSocketServerProtocol
except Exception:
    WebSocketServerProtocol = object  # type: ignore


ALLOWED_PATHS = {"/packets", "/"}


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def to_text(msg) -> str:
    if isinstance(msg, bytes):
        try:
            return msg.decode("utf-8", errors="replace")
        except Exception:
            return repr(msg)
    return str(msg)


class ProxyState:
    def __init__(self, upstream_url: str):
        self.upstream_url = upstream_url
        self.upstream = None
        self.upstream_send_lock = asyncio.Lock()

        self.clients: set[WebSocketServerProtocol] = set()
        self.clients_lock = asyncio.Lock()

        self.stop = asyncio.Event()

    async def connect_upstream_loop(self):
        while not self.stop.is_set():
            try:
                print(f"[{ts()}] UPSTREAM connect -> {self.upstream_url}")
                async with websockets.connect(self.upstream_url) as up:
                    self.upstream = up
                    print(f"[{ts()}] UPSTREAM connected")

                    async for msg in up:
                        raw = to_text(msg)
                        print(f"[{ts()}] RAW upstream->ui: {raw}")

                        # broadcast an alle Clients
                        async with self.clients_lock:
                            clients = list(self.clients)

                        if not clients:
                            continue

                        dead = []
                        for c in clients:
                            try:
                                await c.send(msg)
                            except Exception:
                                dead.append(c)

                        if dead:
                            async with self.clients_lock:
                                for d in dead:
                                    self.clients.discard(d)

            except Exception as e:
                self.upstream = None
                print(f"[{ts()}] UPSTREAM disconnected ({e}). retry in 2s")
                await asyncio.sleep(2)

    async def send_to_upstream(self, msg):
        up = self.upstream
        if up is None:
            print(f"[{ts()}] RAW ui->upstream: (drop, upstream offline)")
            return
        async with self.upstream_send_lock:
            await up.send(msg)


async def downstream_handler(ws: WebSocketServerProtocol, path: str, state: ProxyState):
    if path not in ALLOWED_PATHS:
        await ws.close(code=1008, reason="Unsupported path, use /packets")
        return

    async with state.clients_lock:
        state.clients.add(ws)

    print(f"[{ts()}] UI connected on {path} (clients={len(state.clients)})")

    try:
        async for msg in ws:
            raw = to_text(msg)
            print(f"[{ts()}] RAW ui->upstream: {raw}")
            try:
                await state.send_to_upstream(msg)
            except Exception as e:
                print(f"[{ts()}] ui->upstream forward failed: {e}")

    except Exception as e:
        print(f"[{ts()}] UI disconnected ({e})")
    finally:
        async with state.clients_lock:
            state.clients.discard(ws)
        print(f"[{ts()}] UI closed (clients={len(state.clients)})")


async def main():
    listen_host = os.getenv("LISTEN_HOST", "127.0.0.1")
    listen_port = int(os.getenv("LISTEN_PORT", "8766"))
    upstream_url = os.getenv("UPSTREAM_URL", "ws://127.0.0.1:8765/packets")

    state = ProxyState(upstream_url)

    print(f"[{ts()}] PROXY listen  -> ws://{listen_host}:{listen_port}/packets")
    print(f"[{ts()}] PROXY upstream-> {upstream_url}")

    upstream_task = asyncio.create_task(state.connect_upstream_loop())

    async def handler(ws, path="/"):
        return await downstream_handler(ws, path, state)

    try:
        async with websockets.serve(handler, listen_host, listen_port):
            await asyncio.Future()
    finally:
        state.stop.set()
        upstream_task.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n[{ts()}] PROXY stopped")

#!/usr/bin/env python3
import asyncio
import os
import sys
from datetime import datetime

import websockets
from websockets.server import WebSocketServerProtocol

LISTEN_HOST = os.getenv("LISTEN_HOST", "127.0.0.1").strip()
LISTEN_PORT = int(os.getenv("LISTEN_PORT", "8766").strip())
UPSTREAM_URL = os.getenv("UPSTREAM_URL", "ws://127.0.0.1:8765/packets").strip()
PATH = os.getenv("WS_PATH", "/packets").strip()

def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]

def log(direction: str, payload):
    # 1:1 anzeigen: Text unverändert ausgeben
    if isinstance(payload, bytes):
        print(f"{ts()} {direction} <binary {len(payload)} bytes>")
        sys.stdout.flush()
        return
    print(f"{ts()} {direction} {payload}")
    sys.stdout.flush()

async def relay(src, dst, direction: str):
    async for msg in src:
        log(direction, msg)
        await dst.send(msg)

async def handler(client):
    # 1) UI-Connect sichtbar machen
    try:
        req_path = getattr(client, "path", None) or "<unknown>"
    except Exception:
        req_path = "<unknown>"

    print(f"{ts()} [CONNECT] UI connected, path={req_path}", flush=True)

    try:
        # 2) Upstream-Connect sichtbar machen
        async with websockets.connect(UPSTREAM_URL) as upstream:
            print(f"{ts()} [CONNECT] upstream connected -> {UPSTREAM_URL}", flush=True)

            t1 = asyncio.create_task(relay(upstream, client, "[UPSTREAM→UI]"))
            t2 = asyncio.create_task(relay(client, upstream, "[UI→UPSTREAM]"))

            done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_EXCEPTION)
            for p in pending:
                p.cancel()

    except Exception as e:
        print(f"{ts()} [ERROR] handler failed: {e!r}", flush=True)
    finally:
        print(f"{ts()} [CLOSE] UI disconnected", flush=True)

async def main():
    print(f"🟣 TapProxy LISTEN  ws://{LISTEN_HOST}:{LISTEN_PORT}{PATH}")
    print(f"🟢 Upstream CONNECT {UPSTREAM_URL}")
    print(f"{ts()} [READY] waiting for UI connections...", flush=True)
    async with websockets.serve(handler, LISTEN_HOST, LISTEN_PORT):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] TapProxy beendet.")

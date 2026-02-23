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
    paket_rate_ms: int = 1600
    ttl_ms: int | None = None
    speed_multiplier: float = 1.0

@dataclass(frozen=True)
class StatusStep:
    status: str

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
    packet_frequency_ms: int
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

# =========================
# ROUTES --- DESIGN ---
# =========================
ROUTES: list[RouteRuntime] = [
        RouteRuntime(
        route_id=37,
        name="SwitchBot Fensterkontakt-> Amazon Server",
        hops=[
            Hop("switchbot_fensterkontakt", "switchbot_hub", "BLE", speed_multiplier=1.0, ttl_ms=65000),
            Hop("switchbot_hub", "wifi_hub", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("wifi_hub", "fritzbox", "Ethernet",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
            StatusStep("switchbot.fensterkontakt.alarm"),
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300),
    ),

    RouteRuntime(
        route_id=38,
        name="Amazon Server -> Hama Kamera",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "hama_camera", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("hama.kamera.steuerbefehle"),                   
            StatusStep("hama.kamera.steuerbefehle"),               
            StatusStep("hama.kamera.steuerbefehle"),               
            StatusStep("hama.kamera.steuerbefehle"),               
            StatusStep("hama.kamera.steuerbefehle"),               
            StatusStep("hama.kamera.steuerbefehle")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=39,
        name="Amazon Server -> Jura 8 Kaffeemaschine",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "jura_coffee_machine", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("jura.kaffeemaschine.ein_aus"),                   
            StatusStep("jura.kaffeemaschine.ein_aus"),               
            StatusStep("jura.kaffeemaschine.ein_aus"),               
            StatusStep("jura.kaffeemaschine.ein_aus"),               
            StatusStep("jura.kaffeemaschine.ein_aus"),               
            StatusStep("jura.kaffeemaschine.ein_aus")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=40,
        name="Amazon Server -> Roborock 8 Staubsauger",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "roborock_vacuum", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("roborock.staubsauger.ein_aus"),                   
            StatusStep("roborock.staubsauger.ein_aus"),               
            StatusStep("roborock.staubsauger.ein_aus"),               
            StatusStep("roborock.staubsauger.ein_aus"),               
            StatusStep("roborock.staubsauger.ein_aus"),               
            StatusStep("roborock.staubsauger.ein_aus")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=41,
        name="Vorwerk Server -> Thermomix",
        hops=[
            Hop("vorwerk_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "thermomix_m6", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("vorwerk.thermomix.ein_aus"),                   
            StatusStep("vorwerk.thermomix.ein_aus"),               
            StatusStep("vorwerk.thermomix.ein_aus"),               
            StatusStep("vorwerk.thermomix.ein_aus"),               
            StatusStep("vorwerk.thermomix.ein_aus"),               
            StatusStep("vorwerk.thermomix.ein_aus")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=42,
        name="Amazon Server -> TP-Link Funksteckdose",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "tplink_socket", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("tplink.funksteckdose.ein_aus"),                   
            StatusStep("tplink.funksteckdose.ein_aus"),               
            StatusStep("tplink.funksteckdose.ein_aus"),               
            StatusStep("tplink.funksteckdose.ein_aus"),               
            StatusStep("tplink.funksteckdose.ein_aus"),               
            StatusStep("tplink.funksteckdose.ein_aus")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=44,
        name="Amazon Server -> FireTV Sick",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "firetv_stick", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("amazon.firetv.audio_video"),                   
            StatusStep("amazon.firetv.audio_video"),               
            StatusStep("amazon.firetv.audio_video"),               
            StatusStep("amazon.firetv.audio_video"),               
            StatusStep("amazon.firetv.audio_video"),               
            StatusStep("amazon.firetv.audio_video")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=45,
        name="Google Server -> Google Chromecast",
        hops=[
            Hop("google_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "chromecast", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("google.chromecast.video_audio"),                   
            StatusStep("google.chromecast.video_audio"),               
            StatusStep("google.chromecast.video_audio"),               
            StatusStep("google.chromecast.video_audio"),               
            StatusStep("google.chromecast.video_audio"),               
            StatusStep("google.chromecast.video_audio")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=46,
        name="Amazon Server -> Amazon Echo Show Smart Display",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "smart_display", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("amazon.echo.audio_video"),                   
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=47,
        name="Amazon Server -> Levoit Luftreiniger",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "levoit_air_purifier", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("amazon.echo.audio_video"),                   
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video"),               
            StatusStep("amazon.echo.audio_video")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=48,
        name="Amazon Server -> Ring Kamera",
        hops=[
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("fritzbox", "wifi_hub", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("wifi_hub", "ring_camera", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[
            StatusStep("amazon.kamera.video_audio"),                   
            StatusStep("amazon.kamera.video_audio"),               
            StatusStep("amazon.kamera.video_audio"),               
            StatusStep("amazon.kamera.video_audio"),               
            StatusStep("amazon.kamera.video_audio"),               
            StatusStep("amazon.kamera.video_audio")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=51,
        name="Pixel 7a -> OralB Zahnbürste",
        hops=[
            
            Hop("pixel_7a", "oralb_toothbrush", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("oralb.zahnbürste.steuerbefehl")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=52,
        name="OralB Zahnbürste -> Pixel 7a",
        hops=[
            
            Hop("oralb_toothbrush", "pixel_7a", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("oralb.zahnbürste.reinigungsroutinen")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=53,
        name="Pixel 7a -> ABUS Fahrradschloss",
        hops=[
            
            Hop("pixel_7a", "abus_lock", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("abus.fahrradschloss.auf_zu")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=54,
        name="ABUS Fahrradschloss -> Pixel 7a",
        hops=[
            
            Hop("abus_lock", "pixel_7a", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("abus.fahrradschloss.status")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=55,
        name="Masterlock Schlüsseltresor -> Pixel 7a",
        hops=[
            
            Hop("masterlock", "pixel_7a", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("masterlock.schlüsseltresor.alarm")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=56,
        name="Pixel 7a -> Masterlock Schlüsseltresor",
        hops=[
            
            Hop("pixel_7a", "masterlock", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("masterlock.schlüsseltresor.auf_zu")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=57,
        name="Garmin Smartwatch -> Pixel 7a",
        hops=[
            
            Hop("garmin_watch", "pixel_7a", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("germin.smartwatch.gesundheitsdaten")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=58,
        name="Pixel 7a -> Garmin Smartwatch",
        hops=[
            
            Hop("pixel_7a", "garmin_watch", "BLE", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("germin.smartwatch.steuerbefehle")                   
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),
    
    RouteRuntime(
        route_id=59,
        name="Pixel 7a -> Google Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "google_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.oralbapp.userdaten"),
            StatusStep("pixel.oralbapp.userdaten"),
            StatusStep("pixel.oralbapp.userdaten"),
            StatusStep("pixel.oralbapp.userdaten"),
            StatusStep("pixel.oralbapp.userdaten")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=60,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.hamaapp.steuerbefehle"),
            StatusStep("pixel.hamaapp.steuerbefehle"),
            StatusStep("pixel.hamaapp.steuerbefehle"),
            StatusStep("pixel.hamaapp.steuerbefehle"),
            StatusStep("pixel.hamaapp.steuerbefehle")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=71,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.juraapp.ein_aus"),
            StatusStep("pixel.juraapp.ein_aus"),
            StatusStep("pixel.juraapp.ein_aus"),
            StatusStep("pixel.juraapp.ein_aus"),
            StatusStep("pixel.juraapp.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),
    
    RouteRuntime(
        route_id=72,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.roborockapp.ein_aus"),
            StatusStep("pixel.roborockapp.ein_aus"),
            StatusStep("pixel.roborockapp.ein_aus"),
            StatusStep("pixel.roborockapp.ein_aus"),
            StatusStep("pixel.roborockapp.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=73,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.ringapp.steuerbefehle"),
            StatusStep("pixel.ringapp.steuerbefehle"),
            StatusStep("pixel.ringapp.steuerbefehle"),
            StatusStep("pixel.ringapp.steuerbefehle"),
            StatusStep("pixel.ringapp.steuerbefehle")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=74,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.tplinkapp.ein_aus"),
            StatusStep("pixel.tplinkapp.ein_aus"),
            StatusStep("pixel.tplinkapp.ein_aus"),
            StatusStep("pixel.tplinkapp.ein_aus"),
            StatusStep("pixel.tplinkapp.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=75,
        name="Pixel 7a -> Amazon Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "amazon_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.levoitapp.ein_aus"),
            StatusStep("pixel.levoitapp.ein_aus"),
            StatusStep("pixel.levoitapp.ein_aus"),
            StatusStep("pixel.levoitapp.ein_aus"),
            StatusStep("pixel.levoitapp.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=61,
        name="Pixel 7a -> Homematic Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "139", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.homematicapp.steuerbefehle"),
            StatusStep("pixel.homematicapp.steuerbefehle"),
            StatusStep("pixel.homematicapp.steuerbefehle"),
            StatusStep("pixel.homematicapp.steuerbefehle"),
            StatusStep("pixel.homematicapp.steuerbefehle")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=62,
        name="Pixel 7a -> Bosch Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "bosch_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.boschapp.steuerbefehle"),
            StatusStep("pixel.boschapp.steuerbefehle"),
            StatusStep("pixel.boschapp.steuerbefehle"),
            StatusStep("pixel.boschapp.steuerbefehle"),
            StatusStep("pixel.boschapp.steuerbefehle")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=63,
        name="Pixel 7a -> Philips Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "phillips_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.philipsapp.steuerbefehle"),
            StatusStep("pixel.philipsapp.steuerbefehle"),
            StatusStep("pixel.philipsapp.steuerbefehle"),
            StatusStep("pixel.philipsapp.steuerbefehle"),
            StatusStep("pixel.philipsapp.steuerbefehle")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=64,
        name="Pixel 7a -> Vorwerk Server",
        hops=[
            
            Hop("pixel_7a", "fritzbox", "WLAN",speed_multiplier=1.0,ttl_ms=65000),
            Hop("fritzbox", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("internet_provider", "vorwerk_server", "Ethernet", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.thermomix.ein_aus"),
            StatusStep("pixel.thermomix.ein_aus"),
            StatusStep("pixel.thermomix.ein_aus"),
            StatusStep("pixel.thermomix.ein_aus"),
            StatusStep("pixel.thermomix.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=65,
        name="Google Server -> Pixel 7a",
        hops=[
            
            Hop("google_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.masterlockapp.standordabfrage"),
            StatusStep("pixel.masterlockapp.standordabfrage"),
            StatusStep("pixel.masterlockapp.standordabfrage"),
            StatusStep("pixel.masterlockapp.standordabfrage"),
            StatusStep("pixel.masterlockapp.standordabfrage")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=76,
        name="Google Server -> Pixel 7a",
        hops=[
            
            Hop("google_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.abusapp.standordabfrage"),
            StatusStep("pixel.abusapp.standordabfrage"),
            StatusStep("pixel.abusapp.standordabfrage"),
            StatusStep("pixel.abusapp.standordabfrage"),
            StatusStep("pixel.abusapp.standordabfrage")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=66,
        name="Amazon Server -> Pixel 7a",
        hops=[
            
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.ringapp.audio_video"),
            StatusStep("pixel.ringapp.audio_video"),
            StatusStep("pixel.ringapp.audio_video"),
            StatusStep("pixel.ringapp.audio_video"),
            StatusStep("pixel.ringapp.audio_video")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=77,
        name="Amazon Server -> Pixel 7a",
        hops=[
            
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.hamaapp.audio_video"),
            StatusStep("pixel.hamaapp.audio_video"),
            StatusStep("pixel.hamaapp.audio_video"),
            StatusStep("pixel.hamaapp.audio_video"),
            StatusStep("pixel.hamaapp.audio_video")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=78,
        name="Amazon Server -> Pixel 7a",
        hops=[
            
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.juraapp.status"),
            StatusStep("pixel.juraapp.status"),
            StatusStep("pixel.juraapp.status"),
            StatusStep("pixel.juraapp.status"),
            StatusStep("pixel.juraapp.status")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=79,
        name="Amazon Server -> Pixel 7a",
        hops=[
            
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.roborockapp.status"),
            StatusStep("pixel.roborockapp.status"),
            StatusStep("pixel.roborockapp.status"),
            StatusStep("pixel.roborockapp.status"),
            StatusStep("pixel.roborockapp.status")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=80,
        name="Amazon Server -> Pixel 7a",
        hops=[
            
            Hop("amazon_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.levoitapp.status"),
            StatusStep("pixel.levoitapp.status"),
            StatusStep("pixel.levoitapp.status"),
            StatusStep("pixel.levoitapp.status"),
            StatusStep("pixel.levoitapp.status")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=67,
        name="Homematic Server -> Pixel 7a",
        hops=[
            
            Hop("139", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.homematicapp.alarm"),
            StatusStep("pixel.homematicapp.alarm"),
            StatusStep("pixel.homematicapp.alarm"),
            StatusStep("pixel.homematicapp.alarm"),
            StatusStep("pixel.homematicapp.alarm")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=67,
        name="Bosch Server -> Pixel 7a",
        hops=[
            
            Hop("bosch_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.boschapp.audio_video"),
            StatusStep("pixel.boschapp.audio_video"),
            StatusStep("pixel.boschapp.audio_video"),
            StatusStep("pixel.boschapp.audio_video"),
            StatusStep("pixel.boschapp.audio_video")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=81,
        name="Bosch Server -> Pixel 7a",
        hops=[
            
            Hop("bosch_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.boschapp.alarm"),
            StatusStep("pixel.boschapp.alarm"),
            StatusStep("pixel.boschapp.alarm"),
            StatusStep("pixel.boschapp.alarm"),
            StatusStep("pixel.boschapp.alarm")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=82,
        name="Bosch Server -> Pixel 7a",
        hops=[
            
            Hop("bosch_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.boschapp.ein_aus"),
            StatusStep("pixel.boschapp.ein_aus"),
            StatusStep("pixel.boschapp.ein_aus"),
            StatusStep("pixel.boschapp.ein_aus"),
            StatusStep("pixel.boschapp.ein_aus")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=83,
        name="Bosch Server -> Pixel 7a",
        hops=[
            
            Hop("bosch_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.boschapp.status"),
            StatusStep("pixel.boschapp.status"),
            StatusStep("pixel.boschapp.status"),
            StatusStep("pixel.boschapp.status"),
            StatusStep("pixel.boschapp.status")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=69,
        name="Philips Server -> Pixel 7a",
        hops=[
            
            Hop("phillips_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.philipsapp.alarm"),
            StatusStep("pixel.philipsapp.alarm"),
            StatusStep("pixel.philipsapp.alarm"),
            StatusStep("pixel.philipsapp.alarm"),
            StatusStep("pixel.philipsapp.alarm")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),

    RouteRuntime(
        route_id=70,
        name="Vorwerk Server -> Pixel 7a",
        hops=[
            
            Hop("vorwerk_server", "internet_provider", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("internet_provider", "pfsense", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("pfsense", "poe_switch", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),
            Hop("poe_switch", "fritzbox", "Ethernet", speed_multiplier=1.0, ttl_ms=65000),

            Hop("fritzbox", "pixel_7a", "WLAN", speed_multiplier=1.0, ttl_ms=65000)
        ],
        steps=[              
            StatusStep("pixel.levoitapp.messwerte"),
            StatusStep("pixel.levoitapp.messwerte"),
            StatusStep("pixel.levoitapp.messwerte"),
            StatusStep("pixel.levoitapp.messwerte"),
            StatusStep("pixel.levoitapp.messwerte")
        ],
        packet_frequency_ms=int(random.random() * 6000 + 300)
    ),
    ###############################################################################################################
    RouteRuntime(
        route_id=5,
        name="Bosch Fensterkontakt -> Bosch Server",
        hops=[
            Hop("499", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.0, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.fensterkontakt.status"),
            StatusStep("bosch.fensterkontakt.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=6,
        name="Bosch Funksteckdose -> Bosch Server",
        hops=[
            Hop("679", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.16, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.funksteckdose.status"),
            StatusStep("bosch.funksteckdose.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=7,
        name="Bosch Wassersensor -> Bosch Server",
        hops=[
            Hop("54", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.25, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.wassersensor.status"),
            StatusStep("bosch.wassersensor.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=8,
        name="Bosch Türschloss -> Bosch Server",
        hops=[
            Hop("496", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.1, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.türschloss.status"),
            StatusStep("bosch.türschloss.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=9,
        name="Bosch Feuermelder -> Bosch Server",
        hops=[
            Hop("493", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.3, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.feuermelder.status"),
            StatusStep("bosch.feuermelder.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=10,
        name="Bosch Bewegungssensor -> Bosch Server",
        hops=[
            Hop("hue_motion", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.3, ttl_ms=17000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bewegungssensor.status"),
            StatusStep("bosch.bewegungssensor.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=11,
        name="Bosch Innenkamera -> Bosch Server",
        hops=[
            Hop("638", "Bosch Smart Home Controller", "ZigBee", speed_multiplier=1.0, ttl_ms=15000),
            Hop("Bosch Smart Home Controller", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "bosch_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.innenkamera.status"),
            StatusStep("bosch.innenkamera.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=12,
        name="Bosch Server ->Bosch Funksteckdose ",
        hops=[
            Hop("bosch_server","5850", "Ethernet", speed_multiplier=1.16, ttl_ms=15000),
            Hop("5850","pfSense" , "Ethernet", speed_multiplier=1.0),
            Hop("pfSense","PoE-Switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch","Bosch Smart Home Controller" , "Ethernet", speed_multiplier=1.0),
            Hop("Bosch Smart Home Controller","638" , "ZigBee", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bosch_server.status"),
            StatusStep("bosch.bosch_server.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=13,
        name="Bosch Server ->Bosch Türschloss",
        hops=[
            Hop("bosch_server","5850", "Ethernet", speed_multiplier=1.16, ttl_ms=15000),
            Hop("5850","pfSense" , "Ethernet", speed_multiplier=1.0),
            Hop("pfSense","PoE-Switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch","Bosch Smart Home Controller" , "Ethernet", speed_multiplier=1.0),
            Hop("Bosch Smart Home Controller","496" , "ZigBee", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bosch_server.status"),
            StatusStep("bosch.bosch_server.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=14,
        name="Bosch Server ->Bosch Feuermelder",
        hops=[
            Hop("bosch_server","5850", "Ethernet", speed_multiplier=1.3, ttl_ms=15000),
            Hop("5850","pfSense" , "Ethernet", speed_multiplier=1.0),
            Hop("pfSense","PoE-Switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch","Bosch Smart Home Controller" , "Ethernet", speed_multiplier=1.0),
            Hop("Bosch Smart Home Controller","493", "ZigBee", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bosch_server.status"),
            StatusStep("bosch.bosch_server.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=15,
        name="Bosch Server ->Bosch Türschloss",
        hops=[
            Hop("bosch_server","5850", "Ethernet", speed_multiplier=1.25, ttl_ms=15000),
            Hop("5850","pfSense" , "Ethernet", speed_multiplier=1.0),
            Hop("pfSense","PoE-Switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch","Bosch Smart Home Controller" , "Ethernet", speed_multiplier=1.0),
            Hop("Bosch Smart Home Controller","638", "ZigBee", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bosch_server.status"),
            StatusStep("bosch.bosch_server.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=16,
        name="Philips Hue Bewegungssensor -> Philips Server",
        hops=[
            Hop("hue_motion","hue_bridge", "ZigBee", speed_multiplier=1.0, ttl_ms=15000),
            Hop("hue_bridge","poe_switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "phillips_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.bewegungssensor.status"),
            StatusStep("bosch.bewegungssensor.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=17,
        name="Philips Hue Schreibtischlampe -> Philips Server",
        hops=[
            Hop("hue_lamp","hue_bridge", "ZigBee", speed_multiplier=1.16, ttl_ms=15000),
            Hop("hue_bridge","poe_switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "phillips_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.hue_lamp.status"),
            StatusStep("bosch.hue_lamp.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=18,
        name="Phillips Server -> Phillips Schreibtischlampe",
        hops=[
            Hop("phillips_server", "5850", "Ethernet", speed_multiplier=1.3, ttl_ms=15000),
            Hop("5850", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("poe_switch", "hue_bridge", "Ethernet", speed_multiplier=1.0),
            Hop("hue_bridge", "hue_motion", "ZigBee", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.phillips_server.status"),
            StatusStep("bosch.phillips_server.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=19,
        name="Homematic Bewegungssensor -> Homematic Server",
        hops=[
            Hop("homematic_motion","homematic_controller", "ZigBee", speed_multiplier=1.0, ttl_ms=15000),
            Hop("homematic_controller","poe_switch" , "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "139", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.homematic_motion.status"),
            StatusStep("bosch.homematic_motion.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=20,
        name="Homematic Rauchmelder -> Homematic Server",
        hops=[
            Hop("homematic_smoke", "homematic_controller", "ZigBee", speed_multiplier=1.16, ttl_ms=15000),
            Hop("homematic_controller", "poe_switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "139", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.homematic_smoke.status"),
            StatusStep("bosch.homematic_smoke.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=21,
        name="Homematic Funksteckdose -> Homematic Server",
        hops=[
            Hop("698", "homematic_controller", "ZigBee", speed_multiplier=1.16, ttl_ms=15000),
            Hop("homematic_controller", "poe_switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "139", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.homematic_funksteckdose.status"),
            StatusStep("bosch.homematic_funksteckdose.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=22,
        name="Hama Kamera -> Amazon Server",
        hops=[
            Hop("hama_camera", "wifi_hub", "WLAN", speed_multiplier=1.16, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.hama_camera.status"),
            StatusStep("bosch.hama_camera.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=23,
        name="Jura 8 Kaffeemaschine -> Amazon Server",
        hops=[
            Hop("jura_coffee_machine", "wifi_hub", "WLAN", speed_multiplier=0.84, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.jura_8_kaffeemaschine.status"),
            StatusStep("bosch.jura_8_kaffeemaschine.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=24,
        name="Roborock 8 Staubsauger -> Amazon Server",
        hops=[
            Hop("roborock_vacuum", "wifi_hub", "WLAN", speed_multiplier=0.9, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.roborock_vacuum.status"),
            StatusStep("bosch.roborock_vacuum.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=25,
        name="Thermomix M6 -> Vorwerk Server",
        hops=[
            Hop("thermomix_m6", "wifi_hub", "WLAN", speed_multiplier=1.0, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "vorwerk_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.thermomix_m6.status"),
            StatusStep("bosch.thermomix_m6.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=26,
        name="TP-Link Funksteckdose -> Amazon Server",
        hops=[
            Hop("tplink_socket", "wifi_hub", "WLAN", speed_multiplier=1.16, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.tplink_socket.status"),
            StatusStep("bosch.tplink_socket.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=27,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("withings_scale", "wifi_hub", "WLAN", speed_multiplier=1.3, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "google_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.withings_scale.status"),
            StatusStep("bosch.withings_scale.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=28,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("firetv_stick", "wifi_hub", "WLAN", speed_multiplier=1.25, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.firetv_stick.status"),
            StatusStep("bosch.firetv_stick.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=29,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("chromecast", "wifi_hub", "WLAN", speed_multiplier=1.3, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "google_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.chromecast.status"),
            StatusStep("bosch.chromecast.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
        RouteRuntime(
        route_id=30,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("smart_display", "wifi_hub", "WLAN", speed_multiplier=1.25, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.smart_display.status"),
            StatusStep("bosch.smart_display.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
    RouteRuntime(
        route_id=31,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("levoit_air_purifier", "wifi_hub", "WLAN", speed_multiplier=1.25, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.levoit_air_purifier.status"),
            StatusStep("bosch.levoit_air_purifier.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
    RouteRuntime(
        route_id=32,
        name="Witings Körperwaage -> Google Server",
        hops=[
            Hop("ring_camera", "wifi_hub", "WLAN", speed_multiplier=1.25, ttl_ms=15000),
            Hop("wifi_hub", "fritzbox", "Ethernet", speed_multiplier=1.0),
            Hop("fritzbox", "PoE-Switch", "Ethernet", speed_multiplier=1.0),
            Hop("PoE-Switch", "pfSense", "Ethernet", speed_multiplier=1.0),
            Hop("pfSense", "5850", "Ethernet", speed_multiplier=1.0),
            Hop("5850", "amazon_server", "Ethernet", speed_multiplier=1.0),
        ],
        steps=[
            StatusStep("bosch.ring_camera.status"),
            StatusStep("bosch.ring_camera.alarm"),
        ],
        packet_frequency_ms=9000,
    ),
]


#Block markieren

#Strg + K, dann Strg + C

#Zum Zurücknehmen: Strg + K, dann Strg + U


""" Protokollübersicht für Routen
export const PROTOCOL_WLAN: Protocol = 'WLAN';
export const PROTOCOL_ZIGBEE: Protocol = 'ZigBee';
export const PROTOCOL_HOMEMATIC_PROPRIETARY: Protocol = 'Homematic Proprietary (ZigBee)';
export const PROTOCOL_BLE: Protocol = 'BLE'; 
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
        "protocol": hop.protocol,
        "packetRateMs": hop.paket_rate_ms,
        "speedMultiplier": float(hop.speed_multiplier),
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
        effective_ms = int(round(hop.paket_rate_ms * float(hop.speed_multiplier * .5)))
        await asyncio.sleep(max(10, effective_ms) / 1000)

MAX_INFLIGHT_PER_ROUTE = 1  # Schutz: nicht unendlich viele parallele Pakete

async def loop_route_sender(ws, route: RouteRuntime):
    if not route.hops:
        await send_obj(ws, make_log(f"Route {route.route_id} hat keine Hops – keine Packets.", "warn"))
        return

    await send_obj(ws, make_log(f"Starte Route-Sender {route.route_id}.", "success"))

    inflight: set[asyncio.Task] = set()
    seq = 0

    try:
        while True:
            # fertige Tasks aufräumen + Exceptions sichtbar machen
            done = {t for t in inflight if t.done()}
            for t in done:
                inflight.remove(t)
                try:
                    t.result()
                except Exception as e:
                    print(f"{ts()} [ROUTE-TASK r{route.route_id}] {e!r}", flush=True)

            # neues Paket starten 
            if len(inflight) < MAX_INFLIGHT_PER_ROUTE:
                seq += 1
                packet_id = f"sim-r{route.route_id}-{int(time.time()*1000)}-{seq}"

                step, idx, total = route.snapshot()
                task = asyncio.create_task(send_one_packet_sequence(ws, route, packet_id, step, idx, total))
                inflight.add(task)

            freq_ms = max(10, int(route.packet_frequency_ms))
            await asyncio.sleep(freq_ms / 1000)

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
    first_hop_ms = ROUTES[0].hops[0].paket_rate_ms if ROUTES and ROUTES[0].hops else 120
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

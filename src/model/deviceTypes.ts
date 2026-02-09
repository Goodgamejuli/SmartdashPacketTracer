import { Protocol } from './schema';
import {
  PROTOCOL_BLE,
  PROTOCOL_DECT,
  PROTOCOL_ETHERNET,
  PROTOCOL_HOMEMATIC_PROPRIETARY,
  PROTOCOL_WLAN,
  PROTOCOL_ZIGBEE,
} from './protocols';

// Geräte nach Kategorien sortiert, jeweils mit Iconn

export type DeviceCategoryId =
  | 'network'
  | 'controllers'
  | 'sensors'
  | 'actuators'
  | 'cameras'
  | 'appliances'
  | 'mobiles'
  | 'cloud';

export type DeviceTypeDef = {
  type: string;
  label: string;
  protocols: Protocol[];
  category: DeviceCategoryId;
  icon: string;
  description?: string;
};

export const DEVICE_CATEGORY_META: Record<
  DeviceCategoryId,
  { label: string; description: string }
> = {
  network: {
    label: 'Netzwerkkern',
    description: 'Router, Switches und Firewalls schaffen das Fundament.',
  },
  controllers: {
    label: 'Smart-Home-Zentralen',
    description: 'Gateways bündeln Funkprotokolle und koordinieren Geräte.',
  },
  sensors: {
    label: 'Sensoren',
    description: 'Erfassen Zustände wie Bewegung, Wasser oder Rauch.',
  },
  actuators: {
    label: 'Aktoren',
    description: 'Steuerbare Geräte wie Steckdosen oder Türschlösser.',
  },
  cameras: {
    label: 'Kameras',
    description: 'Videoüberwachung und Bildaufzeichnung.',
  },
  appliances: {
    label: 'Haushalt & Komfort',
    description: 'Smarte Helfer vom Staubsauger bis zur Kaffeemaschine.',
  },
  mobiles: {
    label: 'Benutzergeräte',
    description: 'Smartphones, Laptops und Wearables der Bewohner.',
  },
  cloud: {
    label: 'Cloud & Dienste',
    description: 'Anbindungen an Hersteller- oder Cloud-Plattformen.',
  },
};

export const ALL_DEVICE_TYPES: DeviceTypeDef[] = [
  {
    type: 'core_router',
    label: 'Core Router',
    protocols: [PROTOCOL_ETHERNET, PROTOCOL_WLAN],
    category: 'network',
    icon: '🛠️',
    description: 'Zentrales Routing, verteilt IP-Adressen und WLAN.',
  },
  {
    type: 'edge_switch',
    label: 'Managed Switch',
    protocols: [PROTOCOL_ETHERNET],
    category: 'network',
    icon: '🔀',
    description: 'Vernetzt kabelgebundene Geräte im LAN.',
  },
  {
    type: 'mesh_access_point',
    label: 'Mesh Access Point',
    protocols: [PROTOCOL_WLAN, PROTOCOL_ETHERNET],
    category: 'network',
    icon: '📡',
    description: 'Sorgt für flächendeckendes WLAN im Haus.',
  },
  {
    type: 'firewall_opensense',
    label: 'Firewall OpenSense',
    protocols: [PROTOCOL_ETHERNET],
    category: 'network',
    icon: '🛡️',
    description: 'Schützt das Heimnetz vor unerwünschtem Verkehr.',
  },
  {
    type: 'switch_dlink',
    label: 'Switch nuclean d-link',
    protocols: [PROTOCOL_ETHERNET],
    category: 'network',
    icon: '🔁',
    description: 'Günstiger Switch für kabelgebundene Geräte.',
  },

  {
    type: 'bosch_controller',
    label: 'Bosch Smart Home Controller',
    protocols: [PROTOCOL_ZIGBEE, PROTOCOL_ETHERNET],
    category: 'controllers',
    icon: '🎛️',
    description: 'Bindet ZigBee- und WLAN-Geräte in das System ein.',
  },
  {
    type: 'fritzbox_gateway',
    label: 'Fritzbox Smart Gateway',
    protocols: [PROTOCOL_DECT, PROTOCOL_WLAN, PROTOCOL_ETHERNET],
    category: 'controllers',
    icon: '📶',
    description: 'Allround-Gateway mit DECT und WLAN.',
  },
  {
    type: 'homematic_controller',
    label: 'Homematic Controller',
    protocols: [PROTOCOL_HOMEMATIC_PROPRIETARY, PROTOCOL_ETHERNET],
    category: 'controllers',
    icon: '🏠',
    description: 'Zentrale für Homematic-Komponenten.',
  },
  {
    type: 'switchbot_controller',
    label: 'Switchbot Hub',
    protocols: [PROTOCOL_BLE],
    category: 'controllers',
    icon: '🤖',
    description: 'Steuert BLE-basierte Switchbot-Geräte.',
  },
  {
    type: 'yale_gateway',
    label: 'Yale Gateway',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'controllers',
    icon: '🔐',
    description: 'Verknüpft Türschlösser mit der Cloud.',
  },
  {
    type: 'openhab_nuc',
    label: 'OpenHAB auf Intel NUC',
    protocols: [PROTOCOL_ETHERNET],
    category: 'controllers',
    icon: '🖥️',
    description: 'Selbst gehostete Heimautomationszentrale.',
  },
  {
    type: 'echo_show_15',
    label: 'Amazon Echo Show 15',
    protocols: [PROTOCOL_WLAN],
    category: 'controllers',
    icon: '🗣️',
    description: 'Sprachassistent mit Smart-Home-Hub.',
  },

  {
    type: 'bosch_fire_alarm',
    label: 'Bosch Feuermelder',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🔥',
    description: 'Schlägt Alarm bei Rauchentwicklung.',
  },
  {
    type: 'bosch_motion_sensor',
    label: 'Bosch Bewegungssensor',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🕵️',
    description: 'Überwacht Räume auf Bewegung.',
  },
  {
    type: 'bosch_contact_sensor',
    label: 'Bosch Kontaktsensor',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🚪',
    description: 'Erkennt geöffnete Türen und Fenster.',
  },
  {
    type: 'bosch_water_sensor',
    label: 'Bosch Wassersensor',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '💧',
    description: 'Frühe Warnung bei Wasserschäden.',
  },
  {
    type: 'hue_motion_sensor',
    label: 'Hue Bewegungssensor',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🎯',
    description: 'Kombiniert Bewegung und Helligkeit.',
  },
  {
    type: 'switchbot_contact_sensor',
    label: 'Switchbot Kontakt',
    protocols: [PROTOCOL_BLE],
    category: 'sensors',
    icon: '🧲',
    description: 'BLE-basiertes Tür-/Fenster-Monitoring.',
  },

  {
    type: 'burgwachter_socket',
    label: 'Burgwächter Steckdose',
    protocols: [PROTOCOL_WLAN],
    category: 'actuators',
    icon: '🔌',
    description: 'Schaltbare WLAN-Steckdose.',
  },
  {
    type: 'bosch-smart-plug',
    label: 'Bosch Funksteckdose',
    protocols: [PROTOCOL_WLAN, PROTOCOL_ZIGBEE],
    category: 'actuators',
    icon: '🔌',
    description: 'Schaltbare WLAN-Steckdose.',
  },
  {
    type: 'fritzbox_socket',
    label: 'Fritzbox Steckdose',
    protocols: [PROTOCOL_DECT],
    category: 'actuators',
    icon: '🔋',
    description: 'DECT-basierte Schaltsteckdose.',
  },
  {
    type: 'homematic_socket',
    label: 'Homematic Steckdose',
    protocols: [PROTOCOL_HOMEMATIC_PROPRIETARY],
    category: 'actuators',
    icon: '⚡',
    description: 'Bindet klassische Verbraucher in Szenarien ein.',
  },
  {
    type: 'homematic_smoke_detector',
    label: 'Homematic Rauchmelder',
    protocols: [PROTOCOL_HOMEMATIC_PROPRIETARY],
    category: 'actuators',
    icon: '🚨',
    description: 'Koppelt Rauch-Events mit Automationen.',
  },
  {
    type: 'homematic_motion_detector',
    label: 'Homematic Bewegungsmelder',
    protocols: [PROTOCOL_HOMEMATIC_PROPRIETARY],
    category: 'actuators',
    icon: '👣',
    description: 'Sensorisch, aber meist für Schaltungen verwendet.',
  },
  {
    type: 'hue_lamp',
    label: 'Philips Hue Stehlampe',
    protocols: [PROTOCOL_ZIGBEE, PROTOCOL_BLE],
    category: 'actuators',
    icon: '💡',
    description: 'Mehrfarbige Beleuchtung via App.',
  },
  {
    type: 'yale_door_lock',
    label: 'Yale Türschloss',
    protocols: [PROTOCOL_BLE],
    category: 'actuators',
    icon: '🗝️',
    description: 'Smartes Türschloss mit BLE-Unterstützung.',
  },
  {
    type: 'tapo_socket',
    label: 'Tapo Steckdose',
    protocols: [PROTOCOL_WLAN],
    category: 'actuators',
    icon: '🔆',
    description: 'Kompakte WLAN-Steckdose mit Verbrauchsmessung.',
  },

  {
    type: 'bosch_camera',
    label: 'Bosch Innenkamera',
    protocols: [PROTOCOL_WLAN],
    category: 'cameras',
    icon: '🎥',
    description: 'Überwacht Innenräume per WLAN.',
  },
  {
    type: 'hama_camera',
    label: 'Hama Innenkamera',
    protocols: [PROTOCOL_WLAN],
    category: 'cameras',
    icon: '📷',
    description: 'Einfache WLAN-Kamera mit App-Steuerung.',
  },
  {
    type: 'ring_camera',
    label: 'Ring Kamera',
    protocols: [PROTOCOL_WLAN],
    category: 'cameras',
    icon: '🔔',
    description: 'Populäre Überwachungskamera für Haustüren.',
  },

  {
    type: 'thermomix',
    label: 'Thermomix',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '🥘',
    description: 'Das smarte Küchenwunder mit Cloud-Anbindung.',
  },
  {
    type: 'jura_coffee',
    label: 'Jura Kaffeemaschine',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '☕',
    description: 'Perfekter Kaffee per App.',
  },
  {
    type: 'roborock_vacuum',
    label: 'Roborock Saugroboter',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '🧹',
    description: 'Selbständige Bodenpflege mit Kartierung.',
  },
  {
    type: 'levoit_air_filter',
    label: 'Levoit Luftfilter',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '🌬️',
    description: 'Verbessert die Luftqualität in Wohnräumen.',
  },
  {
    type: 'withings_scale',
    label: 'Withings Körperwaage',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'appliances',
    icon: '⚖️',
    description: 'Gesundheitsdaten für die ganze Familie.',
  },
  {
    type: 'oralb_toothbrush',
    label: 'OralB Zahnbürste',
    protocols: [PROTOCOL_BLE],
    category: 'appliances',
    icon: '🪥',
    description: 'Begleitet das Zähneputzen via App.',
  },
  {
    type: 'abus_lock',
    label: 'Abus Fahrradschloss',
    protocols: [PROTOCOL_BLE],
    category: 'appliances',
    icon: '🚲',
    description: 'Sichert Fahrräder mit BLE-Vernetzung.',
  },

  {
    type: 'fairphone_4',
    label: 'Fairphone 4',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'mobiles',
    icon: '📱',
    description: 'Nachhaltiges Smartphone für Bewohner.',
  },
  {
    type: 'pixel_7a',
    label: 'Google Pixel 7a',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'mobiles',
    icon: '📲',
    description: 'Modernes Android-Gerät als Steuerzentrale.',
  },
  {
    type: 'laptop',
    label: 'Laptop',
    protocols: [PROTOCOL_WLAN, PROTOCOL_ETHERNET, PROTOCOL_BLE],
    category: 'mobiles',
    icon: '💻',
    description: 'Flexibler Client für alle Automationen.',
  },
  {
    type: 'garmin_watch',
    label: 'Garmin Smart Watch',
    protocols: [PROTOCOL_BLE],
    category: 'mobiles',
    icon: '⌚',
    description: 'Wearable mit BLE-Datenübertragung.',
  },

  {
    type: 'generic_cloud',
    label: 'Hersteller-Cloud',
    protocols: [PROTOCOL_WLAN, PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Allgemeine Cloud-Anbindung für Smart-Home-Dienste.',
  },
  {
    type: 'aws_cloud',
    label: 'AWS Cloud',
    protocols: [PROTOCOL_WLAN, PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '🟦',
    description: 'Erweitert um IoT-Backends und Datenhaltung.',
  },

  {
    type: 'internet_provider',
    label: 'Internet-provider',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '🌐',
    description: 'Abstrakter Knoten für Internet / Provider-Anbindung.',
  },

  {
    type: 'abus_fahrradschloss',
    label: 'Abus Fahrradschloss',
    protocols: [PROTOCOL_BLE],
    category: 'appliances',
    icon: '🚲',
    description: 'BLE-vernetztes Fahrradschloss.',
  },

  {
    type: 'air_purifier',
    label: 'Levoit Luftreiniger',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '🌬️',
    description: 'Luftreiniger mit WLAN-Steuerung.',
  },

  {
    type: 'amazon_echo_show',
    label: 'Amazon Echo Show Smart Display',
    protocols: [PROTOCOL_WLAN],
    category: 'controllers',
    icon: '🗣️',
    description: 'Smart Display mit Alexa-Sprachsteuerung.',
  },

  {
    type: 'amazon_server',
    label: 'Amazon Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Cloud-Backend für Amazon-Dienste.',
  },

  {
    type: 'bosch_bewegungssensor',
    label: 'Bosch Bewegungssensor (DECT)',
    protocols: [PROTOCOL_DECT],
    category: 'sensors',
    icon: '🕵️',
    description: 'Bewegungsmelder auf DECT-Basis.',
  },

  {
    type: 'bosch_fensterkontakt',
    label: 'Bosch Fensterkontakt (DECT)',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🚪',
    description: 'DECT-basierter Tür-/Fensterkontakt.',
  },

  {
    type: 'bosch_rauchmelder',
    label: 'Bosch Rauchmelder (DECT)',
    protocols: [PROTOCOL_DECT],
    category: 'sensors',
    icon: '🔥',
    description: 'Rauchmelder im Bosch-DECT-Ökosystem.',
  },

  {
    type: 'bosch_server',
    label: 'Bosch Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Hersteller-Backend für Bosch-Smart-Home.',
  },

  {
    type: 'bosch_tuerschloss',
    label: 'Bosch Türschloss',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'actuators',
    icon: '🔐',
    description: 'Smartes Türschloss mit DECT-Anbindung.',
  },

  {
    type: 'camera',
    label: 'WLAN-Kamera',
    protocols: [PROTOCOL_WLAN],
    category: 'cameras',
    icon: '📷',
    description: 'Allgemeine IP-Kamera im WLAN.',
  },

  {
    type: 'chromecast',
    label: 'Google Chromecast',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '📺',
    description: 'Streaming-Stick für Fernseher.',
  },

  {
    type: 'coffee_machine',
    label: 'Kaffeemaschine',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '☕',
    description: 'Verbindet die Kaffeemaschine mit dem Heimnetz.',
  },

  {
    type: 'firetv_stick',
    label: 'Fire TV Stick',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '📺',
    description: 'Streaming-Stick von Amazon.',
  },

  {
    type: 'fritz_funksteckdose',
    label: 'Fritz!DECT Funksteckdose',
    protocols: [PROTOCOL_DECT],
    category: 'actuators',
    icon: '🔌',
    description: 'Schaltbare DECT-Steckdose für die Fritzbox.',
  },

  {
    type: 'fritz_gateway',
    label: 'Fritz DECT Gateway',
    protocols: [PROTOCOL_DECT],
    category: 'controllers',
    icon: '📶',
    description: 'Bindet DECT-Sensoren und -Aktoren ein.',
  },

  {
    type: 'garmin_smartwatch',
    label: 'Garmin Smartwatch',
    protocols: [PROTOCOL_BLE],
    category: 'mobiles',
    icon: '⌚',
    description: 'Wearable mit BLE-Verbindung.',
  },

  {
    type: 'google_server',
    label: 'Google Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Cloud-Backend von Google.',
  },

  {
    type: 'homematic_funksteckdose',
    label: 'Homematic Funksteckdose',
    protocols: [PROTOCOL_ZIGBEE, PROTOCOL_WLAN],
    category: 'actuators',
    icon: '🔌',
    description: 'Schaltbare Steckdose im Homematic-System (ZigBee-Modell).',
  },

  {
    type: 'homematic_motion_sensor',
    label: 'Homematic Bewegungssensor',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '👣',
    description: 'Bewegungssensor im Homematic-Umfeld (ZigBee).',
  },

  {
    type: 'homematic_rauchmelder',
    label: 'Homematic Rauchmelder',
    protocols: [PROTOCOL_ZIGBEE],
    category: 'sensors',
    icon: '🚨',
    description: 'Rauchmelder im Homematic-System (ZigBee).',
  },

  {
    type: 'masterlock_schluesseltresor',
    label: 'Masterlock Schlüsseltresor',
    protocols: [PROTOCOL_BLE],
    category: 'appliances',
    icon: '🔑',
    description: 'BLE-gesicherter Schlüsseltresor.',
  },

  {
    type: 'openhub_server',
    label: 'OpenHUB Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Serveranbindung für OpenHUB/Smart-Home-Dienste.',
  },

  {
    type: 'oralb_zahnbuerste',
    label: 'Oral-B Zahnbürste',
    protocols: [PROTOCOL_BLE],
    category: 'appliances',
    icon: '🪥',
    description: 'Elektrische Zahnbürste mit BLE-App-Kopplung.',
  },

  {
    type: 'pfsense',
    label: 'pfSense Firewall',
    protocols: [PROTOCOL_ETHERNET],
    category: 'network',
    icon: '🛡️',
    description: 'Open-Source-Firewall auf eigener Hardware.',
  },

  {
    type: 'philips_hue_bridge',
    label: 'Philips Hue Bridge',
    protocols: [PROTOCOL_ETHERNET, PROTOCOL_ZIGBEE],
    category: 'controllers',
    icon: '💡',
    description: 'Zentrale Bridge für Philips-Hue-Leuchten.',
  },

  {
    type: 'phillips_server',
    label: 'Philips Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Hersteller-Backend für Philips/Hue.',
  },

  {
    type: 'poe_switch',
    label: 'PoE-Switch',
    protocols: [PROTOCOL_ETHERNET],
    category: 'network',
    icon: '🔌',
    description: 'Versorgt Endgeräte über Power-over-Ethernet.',
  },

  {
    type: 'smartphone',
    label: 'Smartphone',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'mobiles',
    icon: '📱',
    description: 'Mobiles Endgerät zur Steuerung des Smart Homes.',
  },

  {
    type: 'switchbot_fensterkontakt',
    label: 'SwitchBot Fensterkontakt',
    protocols: [PROTOCOL_BLE],
    category: 'sensors',
    icon: '🧲',
    description: 'Tür-/Fenstersensor im SwitchBot-Ökosystem.',
  },

  {
    type: 'switchbot_hub_mini',
    label: 'SwitchBot Hub Mini',
    protocols: [PROTOCOL_BLE, PROTOCOL_WLAN],
    category: 'controllers',
    icon: '🤖',
    description: 'Kompakter Hub, der BLE-Geräte mit der Cloud verbindet.',
  },

  {
    type: 'switchbot_server',
    label: 'SwitchBot Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Cloud-Backend für SwitchBot-Geräte.',
  },

  {
    type: 'thermomix_m6',
    label: 'Thermomix M6',
    protocols: [PROTOCOL_WLAN],
    category: 'appliances',
    icon: '🥘',
    description: 'Neue Generation des vernetzten Kochsystems.',
  },

  {
    type: 'tplink_funksteckdose',
    label: 'TP-Link Funksteckdose',
    protocols: [PROTOCOL_WLAN],
    category: 'actuators',
    icon: '🔌',
    description: 'Schaltbare WLAN-Steckdose von TP-Link.',
  },

  {
    type: 'vorwerk_server',
    label: 'Vorwerk Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Vorwerk-Cloud für Thermomix & Co.',
  },

  {
    type: 'homematic_server',
    label: 'Homematic Server',
    protocols: [PROTOCOL_ETHERNET],
    category: 'cloud',
    icon: '☁️',
    description: 'Homematic Server',
  },

  {
    type: 'withings_koerperwaage',
    label: 'Withings Körperwaage',
    protocols: [PROTOCOL_WLAN, PROTOCOL_BLE],
    category: 'appliances',
    icon: '⚖️',
    description: 'Vernetzte Körperwaage von Withings.',
  },
];

// Gruppenstruktur für eine ordentlich gerenderte Geräteliste
export const DEVICE_TYPES_BY_CATEGORY: Record<DeviceCategoryId, DeviceTypeDef[]> =
  ALL_DEVICE_TYPES.reduce((acc, device) => {
    if (!acc[device.category]) {
      acc[device.category] = [];
    }
    acc[device.category].push(device);
    return acc;
  }, {} as Record<DeviceCategoryId, DeviceTypeDef[]>);

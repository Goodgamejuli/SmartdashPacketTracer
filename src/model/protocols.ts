import { Protocol } from './schema';

// Sammlung aller Protokolltypen inkl. Farben für die farbigen Verbindungen

export const PROTOCOL_WLAN: Protocol = 'WLAN';
export const PROTOCOL_ZIGBEE: Protocol = 'ZigBee';
export const PROTOCOL_HOMEMATIC_PROPRIETARY: Protocol = 'Homematic Proprietary (ZigBee)';
export const PROTOCOL_BLE: Protocol = 'Bluetooth Low Energy';
export const PROTOCOL_DECT: Protocol = 'DECT';
export const PROTOCOL_ETHERNET: Protocol = 'Ethernet';

export const PROTOCOL_META: Record<Protocol, { color: string; label: string }> = {
  [PROTOCOL_WLAN]: { color: '#2563eb', label: 'WLAN (Funk)' },
  [PROTOCOL_ZIGBEE]: { color: '#d97706', label: 'ZigBee (Mesh)' },
  [PROTOCOL_HOMEMATIC_PROPRIETARY]: {
    color: '#7c3aed',
    label: 'Homematic (proprietär)',
  },
  [PROTOCOL_BLE]: { color: '#10b981', label: 'Bluetooth Low Energy' },
  [PROTOCOL_DECT]: { color: '#dc2626', label: 'DECT (Telefonie)' },
  [PROTOCOL_ETHERNET]: { color: '#111827', label: 'Ethernet / LAN' },
};

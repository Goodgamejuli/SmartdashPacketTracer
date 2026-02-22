// Zentrale Typen für die Topologie

export type Protocol =
  | 'WLAN'
  | 'ZigBee'
  | 'Homematic Proprietary (ZigBee)'
  | 'BLE'
  | 'DECT'
  | 'Ethernet';

export type Device = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  room?: string | null;
  protocols: Protocol[];
  battery?: number | null;
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  protocol: Protocol;
};

export type LogEvent = {
  id: string;
  ts: string;
  severity: 'info' | 'warn' | 'error';
  text: string;
  deviceId?: string;
};

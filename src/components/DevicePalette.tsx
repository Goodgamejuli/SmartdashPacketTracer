import React from 'react';
import {
  DEVICE_CATEGORY_META,
  DEVICE_TYPES_BY_CATEGORY,
  DeviceCategoryId,
  DeviceTypeDef,
} from '../model/deviceTypes';
import { PROTOCOL_META } from '../model/protocols';

const CATEGORY_ORDER: DeviceCategoryId[] = [
  'network',
  'controllers',
  'sensors',
  'actuators',
  'cameras',
  'appliances',
  'mobiles',
  'cloud',
];

const DeviceItem: React.FC<{ device: DeviceTypeDef }> = ({ device }) => {
  // Drag&Drop-Verhalten. 
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/reactflow', device.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="group rounded border border-gray-200 bg-white p-2 shadow-sm transition hover:border-blue-400 hover:shadow"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          {device.icon}
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight">{device.label}</div>
          {device.description && (
            <p className="text-xs text-gray-500">{device.description}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {device.protocols.map((protocol) => (
          <span
            key={protocol}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: PROTOCOL_META[protocol]?.color ?? '#4b5563' }}
          >
            {PROTOCOL_META[protocol]?.label ?? protocol}
          </span>
        ))}
      </div>
    </div>
  );
};

const ProtocolLegend: React.FC = () => (
  <div className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs text-gray-600">
    <h4 className="mb-2 font-semibold text-gray-700">Verbindungsarten</h4>
    <p className="mb-2">
      Jede Verbindung erhält automatisch die passende Farbe. Ziehe Geräte aufs
      Canvas und verbinde sie, sobald ein gemeinsames Protokoll vorhanden ist.
    </p>
    <div className="grid grid-cols-1 gap-1">
      {Object.entries(PROTOCOL_META).map(([protocol, meta]) => (
        <div key={protocol} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-8 rounded"
            style={{ backgroundColor: meta.color }}
          />
          <span>{meta.label}</span>
        </div>
      ))}
    </div>
  </div>
);

const DevicePalette: React.FC = () => {
  const orderedCategories = CATEGORY_ORDER.filter((cat) => DEVICE_TYPES_BY_CATEGORY[cat]);

  return (
    <div className="h-full overflow-y-auto border-r border-gray-200 bg-white p-3 shadow-lg">
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Gerätepalette</h3>

      <ProtocolLegend />

      <div className="space-y-4">
        {orderedCategories.map((category) => {
          const meta = DEVICE_CATEGORY_META[category];
          const devices = DEVICE_TYPES_BY_CATEGORY[category];
          if (!devices) return null;

          return (
            <section key={category}>
              <header className="mb-2">
                <h4 className="text-sm font-semibold text-gray-700">{meta.label}</h4>
                <p className="text-xs text-gray-500">{meta.description}</p>
              </header>
              <div className="space-y-2">
                {devices.map((device) => (
                  <DeviceItem key={device.type} device={device} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default DevicePalette;

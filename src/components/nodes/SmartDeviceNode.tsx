import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';

import type { Protocol } from '../../model/schema';
import { PROTOCOL_META } from '../../model/protocols';

export type SmartDeviceNodeData = {
  label: string;
  protocols: Protocol[];
  icon?: string;
  categoryLabel?: string;
} & Record<string, unknown>;

export type SmartDeviceFlowNode = Node<SmartDeviceNodeData, 'smartDevice'>;

const SmartDeviceNode: React.FC<NodeProps<SmartDeviceFlowNode>> = ({ data, selected }) => {
  const { label, protocols, icon, categoryLabel } = data;

  return (
    <div
      className={`min-w-[140px] rounded-lg border bg-white p-3 shadow transition ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-300'
      }`}
    >
      {/* Oben */}
      <Handle id="top-source" type="source" position={Position.Top} />
      <Handle id="top-target" type="target" position={Position.Top} />

      {/* Rechts */}
      <Handle id="right-source" type="source" position={Position.Right} />
      <Handle id="right-target" type="target" position={Position.Right} />

      {/* Unten */}
      <Handle id="bottom-source" type="source" position={Position.Bottom} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} />

      {/* Links */}
      <Handle id="left-source" type="source" position={Position.Left} />
      <Handle id="left-target" type="target" position={Position.Left} />

      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>
          {icon ?? '📦'}
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight text-gray-800">{label}</div>
          {categoryLabel && (
            <div className="text-[11px] uppercase tracking-wide text-gray-400">{categoryLabel}</div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {protocols.map((protocol: Protocol) => (
          <span
            key={protocol}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: PROTOCOL_META[protocol]?.color ?? '#4b5563' }}
          >
            {PROTOCOL_META[protocol]?.label ?? protocol}
          </span>
        ))}
        {protocols.length === 0 && (
          <span className="text-[10px] text-gray-400">keine Funk-/Netzwerkverbindung</span>
        )}
      </div>
    </div>
  );
};

export default React.memo(SmartDeviceNode);

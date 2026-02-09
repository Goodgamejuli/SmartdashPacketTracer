import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
  type ReactFlowInstance,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ALL_DEVICE_TYPES, DEVICE_CATEGORY_META } from '../model/deviceTypes';
import { PROTOCOL_META } from '../model/protocols';
import { type Device, useTopologyStore } from '../store/useTopologyStore';

import SmartDeviceNode from './nodes/SmartDeviceNode';
import ProtocolEdge from './ProtocolEdge';

const nodeTypes = { smartDevice: SmartDeviceNode };
const edgeTypes = { protocol: ProtocolEdge };

const TopologyCanvasContent: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const devices = useTopologyStore((s) => s.devices);
  const edgesInStore = useTopologyStore((s) => s.edges);
  const flightsByEdgeId = useTopologyStore((s) => s.flightsByEdgeId);

  const addDevice = useTopologyStore((s) => s.addDevice);
  const removeDevice = useTopologyStore((s) => s.removeDevice);
  const addEdgeToStore = useTopologyStore((s) => s.addEdge);
  const removeEdgeFromStore = useTopologyStore((s) => s.removeEdge);
  const updateDevicePosition = useTopologyStore((s) => s.updateDevicePosition);
  const addLog = useTopologyStore((s) => s.addLog);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

  const deviceDefByType = useMemo(() => new Map(ALL_DEVICE_TYPES.map((def) => [def.type, def])), []);

  useEffect(() => {
    setNodes(
      devices.map<FlowNode>((device) => {
        const def = deviceDefByType.get(device.type);
        return {
          id: device.id,
          type: 'smartDevice',
          position: { x: device.x, y: device.y },
          data: {
            label: device.label,
            protocols: device.protocols,
            icon: def?.icon ?? '📦',
            categoryLabel: def?.category ? DEVICE_CATEGORY_META[def.category]?.label : undefined,
          },
        };
      })
    );
  }, [devices, deviceDefByType, setNodes]);

  useEffect(() => {
    setEdges(
      edgesInStore.map<FlowEdge>((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,

        // ✅ Handles aus gespeicherter Topologie
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,

        // ✅ custom edge (rendered von ProtocolEdge)
        type: 'protocol',

        // ✅ KEINE Pfeile: markerEnd nicht setzen
        // markerEnd: ...

        style: {
          stroke: PROTOCOL_META[edge.protocol]?.color ?? '#4b5563',
          strokeWidth: 2,
        },

        data: {
          protocol: edge.protocol,
          flights: flightsByEdgeId[edge.id] ?? [],
        },
      }))
    );
  }, [edgesInStore, flightsByEdgeId, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) {
        addLog('Verbindung ohne Quelle oder Ziel wurde verworfen.', 'warn');
        return;
      }

      const sourceDevice = devices.find((d) => d.id === params.source);
      const targetDevice = devices.find((d) => d.id === params.target);

      if (!sourceDevice || !targetDevice) {
        addLog('Die ausgewählten Geräte konnten nicht gefunden werden.', 'error');
        return;
      }

      const sharedProtocols = sourceDevice.protocols.filter((p) => targetDevice.protocols.includes(p));
      if (sharedProtocols.length === 0) {
        addLog(`Keine gemeinsame Verbindungsart zwischen ${sourceDevice.label} und ${targetDevice.label}.`, 'warn');
        return;
      }

      let chosenProtocol = sharedProtocols[0];

      if (sharedProtocols.length > 1) {
        const selection = window.prompt(
          `Mehrere Protokolle verfügbar:\n${sharedProtocols
            .map((p, i) => `${i + 1}. ${PROTOCOL_META[p]?.label ?? p}`)
            .join('\n')}\nBitte eine Zahl auswählen:`,
          '1'
        );

        const selectedIndex = selection ? Number(selection) - 1 : 0;
        if (Number.isNaN(selectedIndex) || !sharedProtocols[selectedIndex]) {
          addLog('Verbindungsaufbau wurde abgebrochen.', 'warn');
          return;
        }
        chosenProtocol = sharedProtocols[selectedIndex];
      }

      // ✅ Duplikate inkl. Handles prüfen
      const duplicate = edgesInStore.find(
        (e) =>
          e.source === params.source &&
          e.target === params.target &&
          e.protocol === chosenProtocol &&
          (e.sourceHandle ?? null) === (params.sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (params.targetHandle ?? null)
      );
      if (duplicate) {
        addLog('Diese Verbindung existiert bereits.', 'warn');
        return;
      }

      // ✅ Handles speichern!
      addEdgeToStore({
        source: params.source,
        target: params.target,
        protocol: chosenProtocol,
        sourceHandle: params.sourceHandle ?? null,
        targetHandle: params.targetHandle ?? null,
      });

      addLog(
        `Verbindung erstellt: ${sourceDevice.label} ⇄ ${targetDevice.label} über ${
          PROTOCOL_META[chosenProtocol]?.label ?? chosenProtocol
        }.`,
        'success'
      );
    },
    [addEdgeToStore, addLog, devices, edgesInStore]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!rf) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const def = ALL_DEVICE_TYPES.find((d) => d.type === type);
      if (!def) {
        addLog('Geräte-Typ konnte nicht gefunden werden.', 'error');
        return;
      }

      const pos: XYPosition = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newDev: Omit<Device, 'id'> = {
        type: def.type,
        label: def.label,
        x: pos.x,
        y: pos.y,
        protocols: def.protocols,
      };
      const created = addDevice(newDev);

      setNodes((nds) =>
        nds.concat({
          id: created.id,
          type: 'smartDevice',
          position: pos,
          data: {
            label: def.label,
            protocols: def.protocols,
            icon: def.icon,
            categoryLabel: DEVICE_CATEGORY_META[def.category]?.label,
          },
        })
      );

      addLog(`Gerät platziert: ${def.label}`, 'info');
    },
    [rf, addDevice, addLog, setNodes]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: FlowNode) => {
      updateDevicePosition(node.id, node.position.x, node.position.y);
    },
    [updateDevicePosition]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((c) => {
        if (c.type === 'remove') removeDevice(c.id);
      });
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, removeDevice]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      changes.forEach((c) => {
        if (c.type === 'remove') removeEdgeFromStore(c.id);
      });
      onEdgesChangeBase(changes);
    },
    [onEdgesChangeBase, removeEdgeFromStore]
  );

  const onSelectionChange = useCallback((params: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    setSelectedNodeIds(params.nodes.map((n) => n.id));
    setSelectedEdgeIds(params.edges.map((e) => e.id));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }

      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;
      event.preventDefault();

      if (selectedNodeIds.length > 0) {
        const ids = new Set(selectedNodeIds);
        setNodes((curr) => curr.filter((n) => !ids.has(n.id)));
        selectedNodeIds.forEach(removeDevice);
      }

      if (selectedEdgeIds.length > 0) {
        const ids = new Set(selectedEdgeIds);
        setEdges((curr) => curr.filter((e) => !ids.has(e.id)));
        selectedEdgeIds.forEach(removeEdgeFromStore);
      }

      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [removeDevice, removeEdgeFromStore, selectedEdgeIds, selectedNodeIds, setEdges, setNodes]);

  return (
    <div ref={wrapperRef} className="reactflow-wrapper h-full w-full bg-slate-100">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDragStop={onNodeDragStop}
        onInit={setRf}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <MiniMap className="!bg-white/70" />
        <Controls position="top-right" />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
};

const TopologyCanvas: React.FC = () => (
  <ReactFlowProvider>
    <TopologyCanvasContent />
  </ReactFlowProvider>
);

export default TopologyCanvas;

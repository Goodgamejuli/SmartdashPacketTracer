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
import { type Device, useTopologyStore } from '../model/useTopologyStore';

import SmartDeviceNode from '../components/SmartDeviceNode';
import ProtocolEdge from './ProtocolEdge';
import PacketCanvasLayer from './PacketCanvasLayer';

const nodeTypes = { smartDevice: SmartDeviceNode };
const edgeTypes = { protocol: ProtocolEdge };

// Drop-Zentrierung: grobe Node-Größe
const NODE_W = 180;
const NODE_H = 84;

type ProtocolKey = Device['protocols'][number];

type ProtocolOption = {
  protocol: ProtocolKey;
  disabled: boolean; 
  hint?: string; 
};

type ProtocolPickerMode = 'create' | 'edit';

type ProtocolPickerState = {
  mode: ProtocolPickerMode;

  // create
  params?: Connection;

  // edit
  edgeId?: string;

  sourceDevice: Device;
  targetDevice: Device;

  edgeSnapshot?: {
    source: string;
    target: string;
    protocol: ProtocolKey;
    sourceHandle: string | null;
    targetHandle: string | null;
  };

  options: ProtocolOption[];
  selected: ProtocolKey;
};

type ContextMenuState =
  | { kind: 'node'; id: string; x: number; y: number }
  | { kind: 'edge'; id: string; x: number; y: number }
  | null;

const TopologyCanvasContent: React.FC = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

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

  //Hover UI für Kanten
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const routeNameById = useTopologyStore((s: any) => s.routeNameById ?? {});
  const routeStatusById = useTopologyStore((s: any) => s.routeStatusById ?? {});
  // aktive Flights filtern
  const updateRateMs = useTopologyStore((s: any) => (typeof s.updateRateMs === 'number' ? s.updateRateMs : 120));
  const [now, setNow] = useState(() => Date.now());

  type HoverRouteRow = {
  key: string;
  routeId?: number;
  routeName?: string;
  routeStatus?: string;
  label: string;     // Anzeige: routeName oder src→dst
  count: number;     // wie viele aktive Pakete dieser Route auf der Kante
};

const hoveredRoutes = useMemo<HoverRouteRow[]>(() => {
  if (!hoverEdgeId) return [];

  const flights: any[] = Array.isArray(flightsByEdgeId?.[hoverEdgeId]) ? flightsByEdgeId[hoverEdgeId] : [];
  const map = new Map<string, HoverRouteRow>();

  for (const f of flights) {
    const startedAt = typeof f?.startedAt === 'number' ? f.startedAt : 0;
    const durationMs = Math.max(10, Math.round(Number(f?.durationMs ?? 0)));
    const hopEndAt = startedAt + durationMs;

    const expiresAt = typeof f?.expiresAt === 'number' ? f.expiresAt : hopEndAt;
    const endAt = Math.min(hopEndAt, expiresAt);

    if (!(now >= startedAt && now < endAt)) continue;

    const srcId = String(f?.sourceDeviceId ?? '');
    const dstId = String(f?.targetDeviceId ?? '');

    const srcLabel = devices.find((d) => d.id === srcId)?.label ?? srcId;
    const dstLabel = devices.find((d) => d.id === dstId)?.label ?? dstId;

    const payload = f?.payload && typeof f.payload === 'object' ? f.payload : {};
    const ridRaw = (payload as any)?.routeId;
    const routeId = Number.isFinite(Number(ridRaw)) ? Number(ridRaw) : undefined;

    const routeName =
      typeof (payload as any)?.routeName === 'string'
        ? String((payload as any).routeName)
        : undefined;

    const routeStatus =
      typeof (payload as any)?.status === 'string'
        ? String((payload as any).status)
        : undefined;

    const key =
      routeId !== undefined
        ? `rid:${routeId}`
        : routeName
          ? `rname:${routeName}`
          : `hop:${srcLabel}→${dstLabel}`;

    const label = routeName ?? `${srcLabel} → ${dstLabel}`;

    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.routeStatus && routeStatus) prev.routeStatus = routeStatus;
      continue;
    }

    map.set(key, {
      key,
      routeId,
      routeName,
      routeStatus,
      label,
      count: 1,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}, [hoverEdgeId, flightsByEdgeId, now, devices]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), Math.max(16, updateRateMs));
    return () => window.clearInterval(id);
  }, [updateRateMs]);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

  const [protocolPicker, setProtocolPicker] = useState<ProtocolPickerState | null>(null);
  const lastProtocolByPairRef = useRef<Map<string, ProtocolKey>>(new Map());

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const deviceDefByType = useMemo(() => new Map(ALL_DEVICE_TYPES.map((def) => [def.type, def])), []);

  const safeAddLog = useCallback(
    (text: string, level?: any) => {
      (addLog as any)(text, level);
    },
    [addLog]
  );

  const pairKey = useCallback((a: string, b: string) => [a, b].sort().join('|'), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeProtocolPicker = useCallback(() => setProtocolPicker(null), []);

  const getMenuPos = useCallback((clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left + 12,
      y: clientY - rect.top + 8,
    };
  }, []);

  const sharedProtocolsOf = useCallback((a: Device, b: Device) => {
    return a.protocols.filter((p) => b.protocols.includes(p)) as ProtocolKey[];
  }, []);

  const findExactDuplicateEdgeId = useCallback(
    (args: {
      source: string;
      target: string;
      protocol: ProtocolKey;
      sourceHandle: string | null;
      targetHandle: string | null;
      ignoreId?: string;
    }) => {
      const { source, target, protocol, sourceHandle, targetHandle, ignoreId } = args;

      const found = edgesInStore.find(
        (e: any) =>
          e.id !== ignoreId &&
          e.source === source &&
          e.target === target &&
          e.protocol === protocol &&
          (e.sourceHandle ?? null) === (sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (targetHandle ?? null)
      );

      return found?.id ?? null;
    },
    [edgesInStore]
  );

  const finalizeCreateConnection = useCallback(
    (params: Connection, sourceDevice: Device, targetDevice: Device, protocol: ProtocolKey) => {
      if (!params.source || !params.target) {
        safeAddLog('Verbindung ohne Quelle oder Ziel wurde verworfen.', 'warn');
        return;
      }

      const dupId = findExactDuplicateEdgeId({
        source: params.source,
        target: params.target,
        protocol,
        sourceHandle: (params.sourceHandle ?? null) as string | null,
        targetHandle: (params.targetHandle ?? null) as string | null,
      });

      if (dupId) {
        safeAddLog('Diese Verbindung existiert bereits.', 'warn');
        return;
      }

      addEdgeToStore({
        source: params.source,
        target: params.target,
        protocol,
        sourceHandle: params.sourceHandle ?? null,
        targetHandle: params.targetHandle ?? null,
      } as any);

      lastProtocolByPairRef.current.set(pairKey(params.source, params.target), protocol);

      safeAddLog(
        `Verbindung erstellt: ${sourceDevice.label} ⇄ ${targetDevice.label} über ${
          PROTOCOL_META[protocol]?.label ?? protocol
        }.`,
        'success'
      );
    },
    [addEdgeToStore, findExactDuplicateEdgeId, pairKey, safeAddLog]
  );

  const finalizeEditConnection = useCallback(
    (state: ProtocolPickerState) => {
      const snap = state.edgeSnapshot;
      if (!snap || !state.edgeId) {
        safeAddLog('Änderung verworfen. Edge-Daten fehlen.', 'error');
        return;
      }

      const nextProtocol = state.selected;
      const prevProtocol = snap.protocol;

      if (nextProtocol === prevProtocol) {
        safeAddLog('Protokoll blieb unverändert.', 'info');
        return;
      }

      const otherId = findExactDuplicateEdgeId({
        source: snap.source,
        target: snap.target,
        protocol: nextProtocol,
        sourceHandle: snap.sourceHandle,
        targetHandle: snap.targetHandle,
        ignoreId: state.edgeId,
      });

      if (otherId) {
        removeEdgeFromStore(state.edgeId);
        safeAddLog('Protokoll existierte bereits. Doppelte Verbindung wurde entfernt.', 'success');
        return;
      }

      removeEdgeFromStore(state.edgeId);
      addEdgeToStore({
        source: snap.source,
        target: snap.target,
        protocol: nextProtocol,
        sourceHandle: snap.sourceHandle,
        targetHandle: snap.targetHandle,
      } as any);

      safeAddLog(
        `Protokoll geändert: ${state.sourceDevice.label} ⇄ ${state.targetDevice.label} von ${
          PROTOCOL_META[prevProtocol]?.label ?? prevProtocol
        } zu ${PROTOCOL_META[nextProtocol]?.label ?? nextProtocol}.`,
        'success'
      );
    },
    [addEdgeToStore, findExactDuplicateEdgeId, removeEdgeFromStore, safeAddLog]
  );

  const openProtocolPickerCreate = useCallback(
    (params: Connection, sourceDevice: Device, targetDevice: Device, shared: ProtocolKey[]) => {
      if (!params.source || !params.target) return;

      const options: ProtocolOption[] = shared.map((protocol) => {
        const dupId = findExactDuplicateEdgeId({
          source: params.source!,
          target: params.target!,
          protocol,
          sourceHandle: (params.sourceHandle ?? null) as string | null,
          targetHandle: (params.targetHandle ?? null) as string | null,
        });

        return {
          protocol,
          disabled: Boolean(dupId),
          hint: dupId ? 'Bereits verbunden' : undefined,
        };
      });

      const enabled = options.filter((o) => !o.disabled).map((o) => o.protocol);

      if (enabled.length === 0) {
        safeAddLog(
          `Alle möglichen Verbindungen zwischen ${sourceDevice.label} und ${targetDevice.label} existieren bereits.`,
          'warn'
        );
        return;
      }

      if (enabled.length === 1) {
        finalizeCreateConnection(params, sourceDevice, targetDevice, enabled[0]);
        return;
      }

      const key = pairKey(params.source, params.target);
      const preferred = lastProtocolByPairRef.current.get(key);
      const selected = preferred && enabled.includes(preferred) ? preferred : enabled[0];

      setProtocolPicker({
        mode: 'create',
        params,
        sourceDevice,
        targetDevice,
        options,
        selected,
      });
    },
    [finalizeCreateConnection, findExactDuplicateEdgeId, pairKey, safeAddLog]
  );

  const openProtocolPickerEdit = useCallback(
    (edgeId: string) => {
      const edge = edgesInStore.find((e: any) => e.id === edgeId) as any;
      if (!edge) {
        safeAddLog('Verbindung konnte nicht gefunden werden.', 'error');
        return;
      }

      const sourceDevice = devices.find((d) => d.id === edge.source);
      const targetDevice = devices.find((d) => d.id === edge.target);
      if (!sourceDevice || !targetDevice) {
        safeAddLog('Geräte zu dieser Verbindung fehlen.', 'error');
        return;
      }

      const shared = sharedProtocolsOf(sourceDevice, targetDevice);

      if (sourceDevice.protocols.length < 2 || targetDevice.protocols.length < 2 || shared.length < 2) {
        safeAddLog('Keine alternative Protokoll-Option verfügbar.', 'info');
        return;
      }

      const sourceHandle = (edge.sourceHandle ?? null) as string | null;
      const targetHandle = (edge.targetHandle ?? null) as string | null;

      const options: ProtocolOption[] = shared.map((protocol) => {
        const otherId = findExactDuplicateEdgeId({
          source: edge.source,
          target: edge.target,
          protocol,
          sourceHandle,
          targetHandle,
          ignoreId: edgeId,
        });

        return {
          protocol,
          disabled: false, 
          hint: otherId ? 'Existiert bereits. Wird beim Bestätigen zusammengeführt' : undefined,
        };
      });

      const currentProtocol = edge.protocol as ProtocolKey;

      closeContextMenu();

      setProtocolPicker({
        mode: 'edit',
        edgeId,
        sourceDevice,
        targetDevice,
        options,
        selected: currentProtocol,
        edgeSnapshot: {
          source: edge.source,
          target: edge.target,
          protocol: currentProtocol,
          sourceHandle,
          targetHandle,
        },
      });
    },
    [closeContextMenu, devices, edgesInStore, findExactDuplicateEdgeId, safeAddLog, sharedProtocolsOf]
  );

  const confirmProtocolPicker = useCallback(() => {
    if (!protocolPicker) return;

    const selectedOpt = protocolPicker.options.find((o) => o.protocol === protocolPicker.selected);
    if (!selectedOpt) {
      safeAddLog('Auswahl ungültig.', 'warn');
      return;
    }

    if (protocolPicker.mode === 'create' && selectedOpt.disabled) {
      safeAddLog('Diese Verbindung existiert bereits.', 'warn');
      return;
    }

    if (protocolPicker.mode === 'create') {
      if (!protocolPicker.params) {
        safeAddLog('Verbindung verworfen. Verbindungsdaten fehlen.', 'error');
        return;
      }
      finalizeCreateConnection(
        protocolPicker.params,
        protocolPicker.sourceDevice,
        protocolPicker.targetDevice,
        protocolPicker.selected
      );
      closeProtocolPicker();
      return;
    }

    finalizeEditConnection(protocolPicker);
    closeProtocolPicker();
  }, [closeProtocolPicker, finalizeCreateConnection, finalizeEditConnection, protocolPicker, safeAddLog]);

  const cancelProtocolPicker = useCallback(() => {
    closeProtocolPicker();
    safeAddLog('Aktion abgebrochen.', 'warn');
  }, [closeProtocolPicker, safeAddLog]);

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
      edgesInStore.map<FlowEdge>((edge: any) => ({
        id: edge.id,
        type: 'protocol',
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        data: {
          protocol: edge.protocol,
          visualKey: `${edge.source}__${edge.target}__${edge.protocol}`,
        },
        markerEnd: undefined,
      }))
    );
  }, [edgesInStore, flightsByEdgeId, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      closeContextMenu();

      if (!params.source || !params.target) {
        safeAddLog('Verbindung ohne Quelle oder Ziel wurde verworfen.', 'warn');
        return;
      }

      const sourceDevice = devices.find((d) => d.id === params.source);
      const targetDevice = devices.find((d) => d.id === params.target);

      if (!sourceDevice || !targetDevice) {
        safeAddLog('Die ausgewählten Geräte konnten nicht gefunden werden.', 'error');
        return;
      }

      const sharedProtocols = sharedProtocolsOf(sourceDevice, targetDevice);

      if (sharedProtocols.length === 0) {
        safeAddLog(`Keine kompatible Verbindungsart zwischen ${sourceDevice.label} und ${targetDevice.label}.`, 'warn');
        return;
      }

      if (sharedProtocols.length === 1) {
        finalizeCreateConnection(params, sourceDevice, targetDevice, sharedProtocols[0]);
        return;
      }

      openProtocolPickerCreate(params, sourceDevice, targetDevice, sharedProtocols);
    },
    [closeContextMenu, devices, finalizeCreateConnection, openProtocolPickerCreate, safeAddLog, sharedProtocolsOf]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!rf) return;

      closeContextMenu();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const def = ALL_DEVICE_TYPES.find((d) => d.type === type);
      if (!def) {
        safeAddLog('Geräte-Typ konnte nicht gefunden werden.', 'error');
        return;
      }

      const cursorPos: XYPosition = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const centeredPos: XYPosition = {
        x: cursorPos.x - NODE_W / 2,
        y: cursorPos.y - NODE_H / 2,
      };

      const newDev: Omit<Device, 'id'> = {
        type: def.type,
        label: def.label,
        x: centeredPos.x,
        y: centeredPos.y,
        protocols: def.protocols,
      };

      const created = addDevice(newDev);

      setNodes((nds) =>
        nds.concat({
          id: created.id,
          type: 'smartDevice',
          position: centeredPos,
          data: {
            label: def.label,
            protocols: def.protocols,
            icon: def.icon,
            categoryLabel: DEVICE_CATEGORY_META[def.category]?.label,
          },
        })
      );

      safeAddLog(`Gerät platziert: ${def.label}`, 'info');
    },
    [addDevice, closeContextMenu, rf, safeAddLog, setNodes]
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

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: FlowNode) => {
      if (protocolPicker) return;
      const pos = getMenuPos(event.clientX, event.clientY);
      setContextMenu({ kind: 'node', id: node.id, x: pos.x, y: pos.y });
    },
    [getMenuPos, protocolPicker]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: FlowEdge) => {
      if (protocolPicker) return;
      const pos = getMenuPos(event.clientX, event.clientY);
      setContextMenu({ kind: 'edge', id: edge.id, x: pos.x, y: pos.y });
    },
    [getMenuPos, protocolPicker]
  );

  const onPaneClick = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  const deleteNodeById = useCallback(
    (id: string) => {
      setNodes((curr) => curr.filter((n) => n.id !== id));
      removeDevice(id);
      safeAddLog('Gerät entfernt.', 'info');
    },
    [removeDevice, safeAddLog, setNodes]
  );

  const deleteEdgeById = useCallback(
    (id: string) => {
      setEdges((curr) => curr.filter((e) => e.id !== id));
      removeEdgeFromStore(id);
      safeAddLog('Verbindung entfernt.', 'info');
    },
    [removeEdgeFromStore, safeAddLog, setEdges]
  );

  const canSwitchProtocolForContextEdge = useMemo(() => {
    if (!contextMenu || contextMenu.kind !== 'edge') return false;

    const edge = edgesInStore.find((e: any) => e.id === contextMenu.id) as any;
    if (!edge) return false;

    const src = devices.find((d) => d.id === edge.source);
    const tgt = devices.find((d) => d.id === edge.target);
    if (!src || !tgt) return false;

    const shared = sharedProtocolsOf(src, tgt);
    return src.protocols.length >= 2 && tgt.protocols.length >= 2 && shared.length >= 2;
  }, [contextMenu, devices, edgesInStore, sharedProtocolsOf]);

  // Klick ins Leere schließt Kontextmenü (auch bei MiniMap/Controls).
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const t = e.target as Node | null;

      const inMenu = !!(t && contextMenuRef.current && contextMenuRef.current.contains(t));
      const inModal = !!(t && modalRef.current && modalRef.current.contains(t));

      if (!inMenu && !inModal) {
        if (contextMenu) closeContextMenu();
      }
    };

    window.addEventListener('pointerdown', handler, true);
    return () => window.removeEventListener('pointerdown', handler, true);
  }, [closeContextMenu, contextMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (protocolPicker) {
          cancelProtocolPicker();
          return;
        }
        if (contextMenu) {
          closeContextMenu();
          return;
        }
        return;
      }

      if (event.key !== 'Delete') return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }

      if (protocolPicker) return;

      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

      event.preventDefault();
      closeContextMenu();

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
  }, [
    cancelProtocolPicker,
    closeContextMenu,
    contextMenu,
    protocolPicker,
    removeDevice,
    removeEdgeFromStore,
    selectedEdgeIds,
    selectedNodeIds,
    setEdges,
    setNodes,
  ]);

  const canConfirmProtocol = useMemo(() => {
    if (!protocolPicker) return false;
    const opt = protocolPicker.options.find((o) => o.protocol === protocolPicker.selected);
    if (!opt) return false;
    if (protocolPicker.mode === 'create') return !opt.disabled;
    return true;
  }, [protocolPicker]);

  return (
    <div ref={wrapperRef} className="reactflow-wrapper relative h-full w-full bg-slate-100">
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
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => globalThis.dispatchEvent(new CustomEvent('sd:close-edge-inspector'))}
        onInit={setRf}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}        
        proOptions={{ hideAttribution: true }}
        noPanClassName="nopan"
        noDragClassName="nodrag"
        onEdgeMouseEnter={(_e, edge) => {
          setHoverEdgeId(edge.id);
        }}
        onEdgeMouseMove={(e) => {
          const rect = wrapperRef.current?.getBoundingClientRect();
          if (!rect) return;
          setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onEdgeMouseLeave={() => {
          setHoverEdgeId(null);
          setHoverPos(null);
        }}
        
      >
        {hoverEdgeId && hoverPos && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(hoverPos.x + 12, (wrapperRef.current?.clientWidth ?? 0) - 320),
              top: Math.min(hoverPos.y + 12, (wrapperRef.current?.clientHeight ?? 0) - 220),
              width: 300,
              maxHeight: 200,
              overflow: 'auto',
              zIndex: 30,
              background: 'rgba(255,255,255,0.96)',
              border: '1px solid rgba(148,163,184,0.9)',
              borderRadius: 10,
              boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
              padding: 10,
              pointerEvents: 'none', 
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              Pakete auf dieser Kante
            </div>

           {hoveredRoutes.length === 0 ? (
              <div style={{ fontSize: 12, color: '#64748b' }}>Keine aktiven Routen.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hoveredRoutes.slice(0, 50).map((r) => (
                  <div key={r.key} style={{ fontSize: 12, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>×{r.count}</div>
                    </div>

                    {r.routeStatus && (
                      <div style={{ fontSize: 11, color: '#475569' }}>{r.routeStatus}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <PacketCanvasLayer />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap className="!bg-white/70" />
        <Controls position="top-right" />        
      </ReactFlow>
      
      {/* Kontextmenü */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-50 pointer-events-auto nopan nodrag"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
            <div className="flex items-center gap-1 p-1">
              {contextMenu.kind === 'edge' && canSwitchProtocolForContextEdge && (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => openProtocolPickerEdit(contextMenu.id)}
                >
                  <span className="text-base">🔁</span>
                  <span className="font-medium text-slate-900">Protokoll ändern</span>
                </button>
              )}

              <button
                type="button"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  const { id, kind } = contextMenu;
                  closeContextMenu();
                  if (kind === 'node') deleteNodeById(id);
                  if (kind === 'edge') deleteEdgeById(id);
                }}
              >
                <span className="text-base">🗑️</span>
                <span className="font-medium text-slate-900">Löschen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {protocolPicker && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4 nopan nodrag"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancelProtocolPicker();
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/10"
          >
            <div className="border-b border-slate-200 p-4">
              <div className="text-lg font-semibold text-slate-900">
                {protocolPicker.mode === 'edit' ? 'Protokoll ändern' : 'Verbindung herstellen'}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {protocolPicker.sourceDevice.label} ⇄ {protocolPicker.targetDevice.label}
              </div>
            </div>

            <div className="p-4">
              <div className="text-sm font-medium text-slate-700">Protokoll auswählen</div>

              <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                {protocolPicker.options.map((opt) => {
                  const meta = PROTOCOL_META[opt.protocol];
                  const selected = protocolPicker.selected === opt.protocol;

                  const disabled = protocolPicker.mode === 'create' ? opt.disabled : false;

                  return (
                    <button
                      key={String(opt.protocol)}
                      type="button"
                      disabled={disabled}
                      onClick={() => setProtocolPicker((s) => (s ? { ...s, selected: opt.protocol } : s))}
                      className={[
                        'w-full rounded-xl border px-3 py-2 text-left transition',
                        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50',
                        selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: meta?.color ?? '#4b5563' }} />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-900">{meta?.label ?? String(opt.protocol)}</div>
                          {opt.hint && <div className="text-xs text-slate-600">{opt.hint}</div>}
                        </div>
                        {selected && <div className="text-xs font-semibold text-slate-700">Ausgewählt</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={cancelProtocolPicker}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>

              <button
                type="button"
                onClick={confirmProtocolPicker}
                disabled={!canConfirmProtocol}
                className={[
                  'rounded-xl px-3 py-2 text-sm font-semibold',
                  canConfirmProtocol ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-500',
                ].join(' ')}
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TopologyCanvas: React.FC = () => (
  <ReactFlowProvider>
    <TopologyCanvasContent />
  </ReactFlowProvider>
);

export default TopologyCanvas;

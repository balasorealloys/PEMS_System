import { useCallback, useEffect, useMemo } from "react";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow,
  ReactFlowProvider, useReactFlow, useUpdateNodeInternals,
  type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Boxes, Cpu, Flame, Minus, Network, Plus, Zap } from "lucide-react";
import type { SldNode } from "../../api";

export type SldMode = "role" | "cc";
export type Orient = "LR" | "TB";

const ROLE_COLOR: Record<string, string> = {
  grid: "#2563EB", furnace: "#EF4444", incomer: "#7C3AED", aux: "#10B981", unknown: "#64748B",
};
const ROLE_ICON: Record<string, typeof Zap> = {
  grid: Network, furnace: Flame, incomer: Cpu, aux: Boxes, unknown: Zap,
};
const BRANCH_COLORS = ["#F97316", "#10B981", "#2563EB", "#7C3AED", "#06B6D4", "#EC4899", "#EAB308", "#EF4444"];

export const sldKey = (n: SldNode) => `${n.device_id}-${n.feeder_id}`;
const fmtP = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${kw.toFixed(0)} kW`);

const NODE_W = 208;
const NODE_H = 76;

type NodeData = {
  node: SldNode; accent: string; roleColor: string; mode: SldMode; orient: Orient;
  hasChildren: boolean; open: boolean; onToggle: (k: string) => void;
};

function SldFlowNode({ data }: NodeProps<Node<NodeData>>) {
  const { node: n, accent, roleColor, mode, orient, hasChildren, open, onToggle } = data;
  const Ico = ROLE_ICON[n.role] ?? Zap;
  const ccMode = mode === "cc";
  const hasCC = !!n.sld_costcenter;
  const dim = ccMode && !hasCC;
  const vertical = orient === "TB";
  const dot = { background: accent, border: "none", width: 7, height: 7 };
  const toggleCls = vertical
    ? "absolute -bottom-3 left-1/2 -translate-x-1/2"
    : "absolute -right-3 top-1/2 -translate-y-1/2";
  return (
    <div
      className="rounded-xl border-2 bg-card shadow-sm transition-shadow hover:shadow-md"
      style={{ width: NODE_W, minHeight: NODE_H, borderColor: accent, opacity: dim ? 0.55 : 1 }}
    >
      <Handle type="target" position={vertical ? Position.Top : Position.Left} style={dot} />
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
          style={{ background: `color-mix(in srgb, ${roleColor} 18%, transparent)`, color: roleColor }}>
          <Ico size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={n.feeder_name}>{n.feeder_name}</span>
        {n.loss_kw != null && n.loss_kw !== 0 && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: n.loss_kw > 0 ? "#EF444422" : "#10B98122", color: n.loss_kw > 0 ? "#EF4444" : "#10B981" }}>
            {fmtP(Math.abs(n.loss_kw))}{n.loss_pct != null ? ` (${Math.abs(n.loss_pct)}%)` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
        <span className="font-mono text-[10px] text-muted-foreground">{n.device_id}/{n.feeder_id}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: accent }}>{fmtP(n.kw)}</span>
      </div>
      {ccMode && (
        <div className="border-t px-2.5 py-1 text-[10px]" style={{ color: hasCC ? roleColor : undefined }}>
          {hasCC ? <><b>{n.sld_costcenter}</b> {n.costcenter_desc ?? ""}</> : <span className="text-muted-foreground">rolls up → parent / misc</span>}
        </div>
      )}
      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(sldKey(n)); }}
          className={`${toggleCls} grid h-6 w-6 place-items-center rounded-full border-2 bg-card text-xs font-bold shadow-sm`}
          style={{ borderColor: accent, color: accent }}
          title={open ? "Collapse" : `Expand ${n.descendants}`}
        >
          {open ? <Minus size={12} /> : <Plus size={12} />}
        </button>
      )}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} style={dot} />
    </div>
  );
}

const nodeTypes = { sld: SldFlowNode };

export default function SldFlow({
  roots, mode, collapsed, onToggle, colorOf, height = 560, orientation = "LR",
}: {
  roots: SldNode[]; mode: SldMode; collapsed: Set<string>;
  onToggle: (k: string) => void; colorOf: (n: SldNode) => string; height?: number;
  orientation?: Orient;
}) {
  const vertical = orientation === "TB";
  const built = useMemo(() => {
    const rfNodes: Node<NodeData>[] = [];
    const rfEdges: Edge[] = [];
    // virtual root so multiple incomers lay out together; it is not emitted
    const virtual: SldNode = {
      device_id: "__root__", feeder_id: 0, feeder_name: "root", role: "unknown",
      sld_costcenter: null, costcenter_desc: null, kw: 0, subtree_kw: 0, descendants: 0,
      children_kw: null, loss_kw: null, loss_pct: null, children: roots,
    };
    const root = hierarchy<SldNode>(virtual, (n) =>
      n === virtual ? n.children : collapsed.has(sldKey(n)) ? [] : n.children);
    // d3 tree nodeSize = [gap between siblings, gap between depths]. For LR the
    // sibling axis is vertical; for TB it is horizontal — so swap the pair.
    const layout = tree<SldNode>().nodeSize(
      vertical ? [NODE_W + 40, NODE_H + 90] : [NODE_H + 26, NODE_W + 110]);
    const laid = layout(root) as HierarchyPointNode<SldNode>;

    // branch colour = index of the depth-1 ancestor (each top-level incomer subtree)
    const branchColorOf = (hn: HierarchyPointNode<SldNode>): string => {
      let cur: HierarchyPointNode<SldNode> | null = hn;
      while (cur && cur.depth > 1) cur = cur.parent as HierarchyPointNode<SldNode>;
      if (!cur || cur.depth < 1) return ROLE_COLOR.grid;
      const idx = (cur.parent?.children ?? []).indexOf(cur);
      return BRANCH_COLORS[Math.max(0, idx) % BRANCH_COLORS.length];
    };

    laid.each((hn) => {
      if (hn.data === virtual) return;
      const accent = mode === "cc" ? colorOf(hn.data) : branchColorOf(hn);
      const open = !collapsed.has(sldKey(hn.data));
      const h = mode === "cc" && hn.data.sld_costcenter ? 112 : 92;
      rfNodes.push({
        id: sldKey(hn.data),
        type: "sld",
        // d3 assigns hn.x on the sibling axis, hn.y on the depth axis.
        // LR: depth→x, sibling→y (left→right). TB: sibling→x, depth→y (top→down).
        position: vertical ? { x: hn.x, y: hn.y } : { x: hn.y, y: hn.x },
        // Seed dimensions so nodes are visible without waiting on RF's ResizeObserver
        // (unreliable in some environments). A Measurer below then forces handle-bounds
        // measurement via updateNodeInternals so edges render.
        width: NODE_W, height: h, measured: { width: NODE_W, height: h },
        sourcePosition: vertical ? Position.Bottom : Position.Right,
        targetPosition: vertical ? Position.Top : Position.Left,
        data: {
          node: hn.data, accent, roleColor: colorOf(hn.data), mode, orient: orientation,
          hasChildren: hn.data.children.length > 0, open, onToggle,
        },
        draggable: false,
      });
      if (hn.parent && hn.parent.data !== virtual) {
        const ec = mode === "cc" ? colorOf(hn.data) : branchColorOf(hn);
        rfEdges.push({
          id: `${sldKey(hn.parent.data)}->${sldKey(hn.data)}`,
          source: sldKey(hn.parent.data), target: sldKey(hn.data),
          type: "smoothstep", style: { stroke: ec, strokeWidth: 1.8 }, animated: false,
        });
      }
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [roots, mode, collapsed, onToggle, colorOf, orientation, vertical]);

  // Remount on data/orientation changes so a fresh layout + fitView runs.
  const flowKey = useMemo(
    () => `${mode}:${orientation}:${[...collapsed].sort().join(",")}:${built.nodes.length}`,
    [mode, orientation, collapsed, built.nodes.length]);

  const miniColor = useCallback((n: Node) => (n.data as NodeData)?.accent ?? "#64748B", []);
  const nodeIds = useMemo(() => built.nodes.map((n) => n.id), [built.nodes]);

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg">
      <ReactFlowProvider>
        <ReactFlow
          key={flowKey}
          defaultNodes={built.nodes} defaultEdges={built.edges}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.15} maxZoom={1.6}
          proOptions={{ hideAttribution: true }} nodesConnectable={false} nodesDraggable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} className="opacity-60" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={miniColor} pannable zoomable className="!bg-muted" />
          <Measurer nodeIds={nodeIds} flowKey={flowKey} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

// Forces React Flow to read each node's handle bounds (via getBoundingClientRect,
// not ResizeObserver) so edges render, then fits the view. Runs on mount and whenever
// the diagram is rebuilt.
function Measurer({ nodeIds, flowKey }: { nodeIds: string[]; flowKey: string }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView } = useReactFlow();
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      updateNodeInternals(nodeIds);
      raf2 = requestAnimationFrame(() => fitView({ padding: 0.15 }));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [flowKey, nodeIds, updateNodeInternals, fitView]);
  return null;
}

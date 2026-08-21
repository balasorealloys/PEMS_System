import { useMemo, useRef, useState } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  useReactTable, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Load, Meter } from "../api";
import { StatusChip } from "./premium";
import { cn } from "../lib/utils";
import type { Tone } from "../design-system/status";

const roleTone: Record<string, Tone> = {
  grid: "info", furnace: "danger", incomer: "info", aux: "success", unknown: "neutral",
};

// column widths (grid template) — kept in one place so header + rows align
const GRID = "96px 64px minmax(160px,1.4fr) minmax(120px,1fr) 92px minmax(150px,1.3fr) minmax(120px,1fr) 68px 104px 88px";

export default function FeederTable({
  meters, loads, busy, onAssign, onConfirm,
}: {
  meters: Meter[]; loads: Load[]; busy: boolean;
  onAssign: (m: Meter, loadId: number) => void; onConfirm: (mapId: number) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<Meter>[]>(() => [
    { id: "device", accessorKey: "device_id", header: "Device",
      cell: (c) => <span className="font-mono text-xs">{c.getValue<string>()}</span> },
    { id: "feeder", accessorKey: "feeder_id", header: "Fdr",
      cell: (c) => <span className="font-mono text-xs">{c.getValue<number>()}</span> },
    { id: "name", accessorKey: "feeder_name", header: "Feeder Name" },
    { id: "section", accessorKey: "section", header: "Section",
      cell: (c) => <span className="text-muted-foreground">{c.getValue<string>()}</span> },
    { id: "role", accessorKey: "role", header: "Role",
      cell: (c) => <StatusChip tone={roleTone[c.getValue<string>()] ?? "neutral"}>{c.getValue<string>()}</StatusChip> },
    { id: "load", header: "Load", enableSorting: false,
      accessorFn: (m) => m.mappings[0]?.load_id ?? 0,
      cell: (c) => {
        const m = c.row.original; const mp = m.mappings[0];
        return (
          <select className="w-full rounded-md border bg-background px-1.5 py-1 text-xs" disabled={busy}
            value={mp?.load_id ?? ""} onChange={(e) => onAssign(m, Number(e.target.value))}>
            <option value="">— unmapped —</option>
            {loads.map((l) => <option key={l.id} value={l.id}>{l.load_name}</option>)}
          </select>
        );
      } },
    { id: "cc", header: "Cost Center", enableSorting: false,
      accessorFn: (m) => m.mappings[0]?.sap_costcenter ?? "",
      cell: (c) => {
        const mp = c.row.original.mappings[0];
        return mp?.sap_costcenter
          ? <div><div className="font-mono text-xs">{mp.sap_costcenter}</div>
              {mp.costcenter_desc && <div className="truncate text-[11px] text-muted-foreground">{mp.costcenter_desc}</div>}</div>
          : <span className="text-muted-foreground">—</span>;
      } },
    { id: "conf", header: "Conf.",
      accessorFn: (m) => (m.mappings[0]?.match_score != null ? Number(m.mappings[0].match_score) : -1),
      cell: (c) => { const v = c.getValue<number>(); return v >= 0 ? <span className="tabular-nums">{v.toFixed(0)}%</span> : <span className="text-muted-foreground">—</span>; } },
    { id: "status", header: "Status",
      accessorFn: (m) => (!m.mappings[0] ? "unmapped" : m.mappings[0].is_confirmed ? "confirmed" : "suggested"),
      cell: (c) => {
        const s = c.getValue<string>();
        return <StatusChip tone={s === "confirmed" ? "success" : s === "suggested" ? "warning" : "neutral"} dot>
          {s[0].toUpperCase() + s.slice(1)}</StatusChip>;
      } },
    { id: "action", header: "", enableSorting: false,
      cell: (c) => { const mp = c.row.original.mappings[0];
        return mp && !mp.is_confirmed
          ? <button className="btn small" disabled={busy} onClick={() => onConfirm(mp.map_id)}>Confirm</button>
          : null; } },
  ], [loads, busy, onAssign, onConfirm]);

  const table = useReactTable({
    data: meters, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _col, value) => {
      const m = row.original; const q = String(value).toLowerCase();
      return [m.device_id, String(m.feeder_id), m.feeder_name, m.section, m.role]
        .some((f) => String(f).toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 52, overscan: 12,
  });
  const vItems = virtualizer.getVirtualItems();

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <input
          className="w-72 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          placeholder="Search device / feeder / section…"
          value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">{rows.length} of {meters.length} feeders</span>
      </div>

      {/* header */}
      <div className="grid items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: GRID }}>
        {table.getHeaderGroups()[0].headers.map((h) => {
          const canSort = h.column.getCanSort();
          const dir = h.column.getIsSorted();
          return (
            <button key={h.id} disabled={!canSort}
              className={cn("flex items-center gap-1 text-left", canSort && "cursor-pointer hover:text-foreground", !canSort && "cursor-default")}
              onClick={h.column.getToggleSortingHandler()}>
              {flexRender(h.column.columnDef.header, h.getContext())}
              {canSort && (dir === "asc" ? <ArrowUp size={11} /> : dir === "desc" ? <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="opacity-40" />)}
            </button>
          );
        })}
      </div>

      {/* virtualized body */}
      <div ref={scrollRef} className="max-h-[560px] overflow-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No feeders for this filter.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {vItems.map((vi) => {
              const row = rows[vi.index];
              const off = !row.original.is_enabled;
              return (
                <div key={row.id}
                  className={cn("absolute left-0 grid w-full items-center gap-2 border-b border-border/40 px-4 text-sm",
                    off && "opacity-50")}
                  style={{ gridTemplateColumns: GRID, height: vi.size, transform: `translateY(${vi.start}px)` }}>
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="min-w-0 truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

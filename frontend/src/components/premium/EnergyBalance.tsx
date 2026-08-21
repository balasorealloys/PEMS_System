import type { Balance, BalanceLoad } from "../../api";

// Self-contained energy-balance visual: a proportion bar (Grid = Furnaces = Auxiliary)
// over two breakdown columns. No chart lib — always renders, theme-aware via CSS vars.
// The active (MWh) / apparent (MVAh) unit is controlled by the parent's top toggle.
const RED = "#EF4444";
const GREEN = "#10B981";
const SLATE = "#94A3B8";

const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
export type Unit = "MWh" | "MVAh";
const loadVal = (l: BalanceLoad, u: Unit) => (u === "MWh" ? l.mwh : l.mvah);

export default function EnergyBalance({ bal, unit = "MWh" }: { bal: Balance; unit?: Unit }) {
  const isMva = unit === "MVAh";

  // keep furnaces even at 0 when it's a data gap (flag them), so a missing meter
  // is visible rather than silently dropped and leaking into the aux residual.
  const furnaces = [...bal.furnaces].filter((f) => loadVal(f, unit) > 0 || f.no_data)
    .sort((a, b) => loadVal(b, unit) - loadVal(a, unit));
  const auxLoads: BalanceLoad[] = [...bal.individual_loads].filter((l) => loadVal(l, unit) > 0).sort((a, b) => loadVal(b, unit) - loadVal(a, unit));
  const gaps = [...bal.furnaces, ...bal.individual_loads].filter((l) => l.no_data);

  const gridV = isMva ? bal.grid_mvah : bal.grid_mwh;
  const furnV = isMva ? bal.furnace_total_mvah : bal.furnace_total_mwh;
  // MWh: auxiliary is a conserved residual (grid − furnaces), with a misc/line-loss remainder.
  // MVAh: apparent energy is NOT additive across feeders (per-feeder power factor differs), so a
  // residual is meaningless — show the measured sum of sub-metered loads and no residual/misc.
  const auxMeasured = auxLoads.reduce((s, l) => s + loadVal(l, unit), 0);
  const auxV = isMva ? auxMeasured : bal.auxiliary_mwh;
  const miscV = isMva ? 0 : bal.miscellaneous_mwh;

  // proportion bar: share of grid (MWh, conserved) vs share of measured total (MVAh, not additive)
  const barBase = isMva ? (furnV + auxV) || 1 : gridV || 1;
  const furnPct = (furnV / barBase) * 100;
  const auxPct = (auxV / barBase) * 100;

  const furnMax = Math.max(...furnaces.map((f) => loadVal(f, unit)), 1);
  const auxMax = Math.max(...auxLoads.map((l) => loadVal(l, unit)), miscV, 1);

  return (
    <div>
      {/* proportion bar */}
      <div className="mb-1 flex items-end justify-between text-xs">
        <span className="font-semibold">Grid Incomer</span>
        <span className="tabular-nums text-muted-foreground">{fmt(gridV)} {unit} · 132 kV</span>
      </div>
      <div className="flex h-9 w-full overflow-hidden rounded-lg">
        <div className="flex items-center justify-center text-xs font-semibold text-white transition-all"
          style={{ width: `${furnPct}%`, background: RED }} title={`Furnaces ${furnPct.toFixed(1)}%`}>
          {furnPct > 12 && `Furnaces ${furnPct.toFixed(0)}%`}
        </div>
        <div className="flex items-center justify-center text-xs font-semibold text-white transition-all"
          style={{ width: `${auxPct}%`, background: GREEN }} title={`Auxiliary ${auxPct.toFixed(1)}%`}>
          {auxPct > 8 && `Aux ${auxPct.toFixed(0)}%`}
        </div>
      </div>
      {isMva && (
        <div className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-foreground">
          Apparent energy (MVAh) isn't additive across feeders — each has its own power factor — so furnaces + auxiliary need not equal the grid incomer.
          Use <b>MWh</b> for the conserved <b>Grid = Furnaces + Auxiliary</b> balance.
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-foreground">
          ⚠ No meter data this month for {gaps.map((g) => g.load_name).join(", ")} — shown as 0. Their real load is missing here and inflates the Auxiliary residual.
        </div>
      )}

      {/* breakdown columns */}
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-2">
        <div>
          <ColHead color={RED} title="Furnaces" total={furnV} unit={unit} />
          {furnaces.map((f) => <Row key={f.load_code} name={f.load_name} cc={f.sap_costcenter}
            v={loadVal(f, unit)} max={furnMax} color={RED} noData={f.no_data} />)}
        </div>
        <div>
          <ColHead color={GREEN} title={isMva ? "Auxiliary (measured)" : "Auxiliary"} total={auxV} unit={unit} />
          {auxLoads.map((l) => <Row key={l.load_code} name={l.load_name} cc={l.sap_costcenter}
            v={loadVal(l, unit)} max={auxMax} color={GREEN} />)}
          {miscV > 0 && (
            <Row name="Miscellaneous / Line loss" cc={null} v={miscV} max={auxMax} color={SLATE} muted />
          )}
        </div>
      </div>
    </div>
  );
}

function ColHead({ color, title, total, unit }: { color: string; title: string; total: number; unit: Unit }) {
  return (
    <div className="mb-2 flex items-center justify-between border-b pb-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        {title}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{fmt(total)} {unit}</span>
    </div>
  );
}

function Row({ name, cc, v, max, color, muted, noData }: {
  name: string; cc: string | null; v: number; max: number; color: string; muted?: boolean; noData?: boolean;
}) {
  return (
    <div className="group flex items-center gap-3 py-1">
      <div className="flex w-40 shrink-0 items-center gap-1.5 truncate text-xs" title={cc ? `${name} · ${cc}` : name}>
        <span className="truncate">{name}</span>
        {noData && <span className="shrink-0 rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-medium uppercase text-red-600 dark:text-red-400">no data</span>}
        {muted && <span className="text-muted-foreground/60">·</span>}
      </div>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${Math.max((v / max) * 100, noData ? 0 : 1.5)}%`, background: color, opacity: muted ? 0.55 : 0.9 }} />
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-medium tabular-nums">{noData ? "—" : v.toFixed(1)}</div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Bolt, Calendar, ChevronDown, Download, Factory, Flame, IndianRupee, Layers, Percent, Table2,
} from "lucide-react";
import { api, type Balance, type FyMonths, type RateResult } from "../api";
import { KPICard, Card, CardHead, CardBody, ChartFrame, EChart, StatusChip } from "../components/premium";
import EnergyBalance, { type Unit as BalUnit } from "../components/premium/EnergyBalance";
import RateWorkingSheet from "../components/RateWorkingSheet";
import { palette } from "../design-system/charts";
import { useThemeMode } from "../hooks/useThemeMode";
import { useScope } from "../stores/scope";

type BalView = "bars" | "flow";

export default function Accounting() {
  const { range } = useScope();
  const [months, setMonths] = useState<string[]>([]);
  const [bal, setBal] = useState<Balance | null>(null);
  const [rates, setRates] = useState<{ ftd: RateResult; mtd: RateResult; ytd: RateResult } | null>(null);
  const [fyMonths, setFyMonths] = useState<FyMonths | null>(null);
  const [asOf, setAsOf] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showWorking, setShowWorking] = useState(true);
  const [balView, setBalView] = useState<BalView>("bars");
  const [balUnit, setBalUnit] = useState<BalUnit>("MWh");
  const mode = useThemeMode();

  // Accounting is monthly; the month follows the header date-range picker (its end
  // date's month), clamped to a month that actually has data.
  const scopeMonth = range.end.slice(0, 7);
  const month = months.length ? (months.includes(scopeMonth) ? scopeMonth : months[0]) : scopeMonth;

  useEffect(() => {
    api.accountingMonths().then(setMonths).catch((e) => setErr(String(e)));
    api.executive().then((e) => setAsOf((e.date || "").slice(0, 10))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!month) return;
    setErr(null); setBal(null); setRates(null);
    const [y, m] = month.split("-").map(Number);
    const monthEnd = new Date(y, m, 0);
    const day = (asOf && asOf.slice(0, 7) === month) ? asOf : `${month}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    // balance is fast (rollup); render it immediately. Tariff (esp. YTD on raw
    // registers) is slower, so fetch it independently rather than blocking.
    setLoading(true);
    api.balance(month).then(setBal).catch((e) => setErr(String(e))).finally(() => setLoading(false));
    api.rateAll(day).then(setRates).catch(() => {});
  }, [month, asOf]);

  // Month-by-month table follows the header range: shows the full financial year(s)
  // the selected date/range falls in (Apr–Mar), across both FYs if the range spans them.
  useEffect(() => {
    setFyMonths(null);
    api.fyMonths(range.start.slice(0, 10), range.end.slice(0, 10)).then(setFyMonths).catch(() => {});
  }, [range.start, range.end]);

  const rate = rates?.mtd.per_unit_rate ?? 0;
  const gridCostCr = bal && !bal.error ? (bal.grid_mwh * 1000 * rate) / 1e7 : 0;
  const furnacePct = bal && !bal.error && bal.grid_mwh ? (bal.furnace_total_mwh / bal.grid_mwh) * 100 : 0;
  const auxPct = bal && !bal.error && bal.grid_mwh ? (bal.auxiliary_mwh / bal.grid_mwh) * 100 : 0;

  const costBar = useMemo<EChartsOption | null>(
    () => (bal && !bal.error ? buildCostBar(bal, rate, mode) : null), [bal, rate, mode]);
  const sankey = useMemo<EChartsOption | null>(
    () => (bal && !bal.error ? buildSankey(bal, mode) : null), [bal, mode]);

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>Energy Accounting</h1>
          <div className="sub">
            Monthly energy balance <b>Grid = Furnaces + Auxiliary</b>, costed at the blended tariff
            computed on the 132 kV incomer (as TPNODL bills).
          </div>
        </div>
        <div className="head-controls">
          <StatusChip tone="info" dot>
            <Calendar size={12} className="mr-1 inline" />{month ? fmtMonth(month) : "—"}
            {scopeMonth !== month && months.length ? " (latest with data)" : ""}
          </StatusChip>
          <a className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
            href={month ? api.reportXlsxUrl(month) : "#"} title={`Export ${month ? fmtMonth(month) : ""} to Excel`}>
            <Download size={16} />
          </a>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {/* KPI row */}
      {bal && !bal.error && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KPICard label="Grid Energy" value={bal.grid_mwh} unit="MWh" decimals={0} tone="info" icon={<Bolt size={17} />}
            footnote={<span>132 kV incomer</span>} />
          <KPICard label="Furnace Load" value={bal.furnace_total_mwh} unit="MWh" decimals={0} tone="danger" icon={<Flame size={17} />}
            footnote={<span>{furnacePct.toFixed(1)}% of grid</span>} />
          <KPICard label="Auxiliary" value={bal.auxiliary_mwh} unit="MWh" decimals={0} tone="success" icon={<Layers size={17} />}
            footnote={<span>{auxPct.toFixed(1)}% of grid</span>} />
          <KPICard label="Blended Rate" value={rates ? rate : "…"} unit={rates ? "₹/kWh" : ""} decimals={3} prefix={rates ? "₹ " : ""} tone="warning" icon={<IndianRupee size={17} />}
            pending={!rates} footnote={<span>MTD, from incomer bill</span>} />
          <KPICard label="Grid Cost" value={rates ? gridCostCr : "…"} unit={rates ? "Cr" : ""} decimals={2} prefix={rates ? "₹ " : ""} tone="neutral" icon={<Percent size={17} />}
            pending={!rates} footnote={<span>consumption × rate</span>} />
        </div>
      )}

      {loading && <div className="muted">Computing tariff &amp; balance…</div>}

      {/* Energy balance */}
      {bal && !bal.error && (
        <ChartFrame
          title="Energy Balance"
          icon={<Factory size={16} />}
          defaultHeight={balView === "flow" ? Math.max(320, sankeyRows(bal) * 30) : 360}
          zoomable={balView === "flow"}
          right={<StatusChip tone={bal.period.complete ? "success" : "info"} dot>
            {bal.period.complete ? "Full month" : "MTD"}
          </StatusChip>}
          viewToggle={
            <div className="flex items-center gap-2">
              <div className="seg">
                <button className={balView === "bars" ? "active" : ""} onClick={() => setBalView("bars")}>Bars</button>
                <button className={balView === "flow" ? "active" : ""} onClick={() => setBalView("flow")}>Flow</button>
              </div>
              {balView === "bars" && (
                <div className="seg" title="Active (MWh) or apparent (MVAh) energy">
                  <button className={balUnit === "MWh" ? "active" : ""} onClick={() => setBalUnit("MWh")}>MWh</button>
                  <button className={balUnit === "MVAh" ? "active" : ""} onClick={() => setBalUnit("MVAh")}>MVAh</button>
                </div>
              )}
            </div>
          }
        >
          {({ height }) => (balView === "flow"
            ? (sankey ? <EChart option={sankey} height={height} /> : null)
            : <div className="px-2 pb-1"><EnergyBalance bal={bal} unit={balUnit} /></div>)}
        </ChartFrame>
      )}
      {bal && !bal.error && (
        <div className="-mt-2 px-1 text-xs text-muted-foreground">
          Grid = Furnaces + Auxiliary. Auxiliary is the residual after furnaces, split across
          individual metered loads and the Miscellaneous / line-loss remainder.
        </div>
      )}

      {/* Tariff rate cards */}
      {rates && (
        <>
          <div className="mt-1 flex items-center justify-between">
            <div className="section-h" style={{ margin: 0 }}>Tariff Rate — 132 kV Main Incomer</div>
            <button className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent ${showWorking ? "bg-primary/10 text-primary" : ""}`}
              onClick={() => setShowWorking((s) => !s)} title="Full FTD / MTD / YTD bill working">
              <Table2 size={14} /> Bill Working
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <RateCard title="For the Day" sub="FTD" r={rates.ftd} tone="info" />
            <RateCard title="Month to Date" sub="MTD" r={rates.mtd} tone="warning" primary />
            <RateCard title="Year to Date" sub="YTD" r={rates.ytd} tone="success" />
          </div>

          {showWorking && (
            <RateWorkingSheet rates={rates} fyMonths={fyMonths} monthLabel={fmtMonth(month)} onClose={() => setShowWorking(false)} />
          )}

          <Card>
            <CardHead title="MTD Bill Breakdown" icon={<IndianRupee size={16} />}
              right={
                <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setShowBreakdown((s) => !s)}>
                  {showBreakdown ? "Hide" : "Show"} components
                  <ChevronDown size={14} className={showBreakdown ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
              } />
            <CardBody>
              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>Load factor <b className="text-foreground">{rates.mtd.load_factor_pct}%</b></span>
                <span>MD <b className="text-foreground">{fmtN(rates.mtd.md_kva)} kVA</b></span>
                <span>Billable <b className="text-foreground">{fmtN(rates.mtd.billable_kva)} kVA</b></span>
                <span>Total <b className="text-foreground">₹ {(rates.mtd.total / 1e7).toFixed(2)} Cr</b></span>
                <span>Blended <b className="text-foreground">₹ {rate.toFixed(4)}/unit</b></span>
              </div>
              {showBreakdown && (
                <table className="w-full text-sm">
                  <tbody>
                    <BillRow label="Energy charge (kVAh × slab by load factor)" v={rates.mtd.components.energy} />
                    <BillRow label="ToD peak surcharge (+₹0.30/kVAh)" v={rates.mtd.components.tod_surcharge} />
                    <BillRow label="ToD solar incentive (−₹0.20/kVAh)" v={rates.mtd.components.tod_incentive} />
                    <BillRow label={`Demand / MMFC (${fmtN(rates.mtd.billable_kva)} × 250 × ${rates.mtd.days_elapsed}/${rates.mtd.days_in_month})`} v={rates.mtd.components.demand} />
                    <BillRow label="Overdrawal penalty" v={rates.mtd.components.overdrawal} />
                    <BillRow label="High load-factor rebate" v={rates.mtd.components.lf_rebate} />
                    <BillRow label="Electricity Duty (9%)" v={rates.mtd.components.electricity_duty} />
                    <BillRow label="Meter rent + Customer service charge" v={rates.mtd.components.meter_rent + rates.mtd.components.customer_service_charge} />
                    <tr className="border-t font-bold">
                      <td className="py-2">Total bill (MTD)</td>
                      <td className="py-2 text-right">₹ {fmtN(rates.mtd.total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Cost-center cost */}
      {bal && !bal.error && costBar && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <CardHead title="Cost Distribution by Cost Center" icon={<Layers size={16} />} />
            <CardBody><EChart option={costBar} height={Math.max(260, bal.cost_centers.length * 32)} /></CardBody>
          </Card>
          <Card>
            <CardHead title="Cost-Center Ledger" icon={<IndianRupee size={16} />}
              right={<span className="text-xs text-muted-foreground">@ ₹{rate.toFixed(3)}/kWh</span>} />
            <CardBody className="px-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 pb-2 text-left font-medium">Cost Center</th>
                    <th className="pb-2 text-right font-medium">MWh</th>
                    <th className="px-5 pb-2 text-right font-medium">Cost (₹)</th>
                    <th className="px-5 pb-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bal.cost_centers].sort((a, b) => b.mwh - a.mwh).map((c) => {
                    const share = bal.grid_mwh ? (c.mwh / bal.grid_mwh) * 100 : 0;
                    return (
                      <tr key={c.sap_costcenter ?? "none"} className="border-b border-border/50 last:border-0">
                        <td className="px-5 py-2">
                          <div className="font-mono text-xs">{c.sap_costcenter ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{c.description ?? "Unallocated"}</div>
                        </td>
                        <td className="py-2 text-right tabular-nums">{c.mwh.toFixed(1)}</td>
                        <td className="px-5 py-2 text-right font-semibold tabular-nums">{fmtN(c.mwh * 1000 * rate)}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{share.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {bal && !bal.error && (
        <div className="text-xs text-muted-foreground">
          Cost = consumption × blended per-unit rate from the incomer bill. {bal.method}
        </div>
      )}
    </div>
  );
}

/* ---------- charts ---------- */
function sankeyRows(b: Balance) {
  return Math.max(b.furnaces.filter((f) => f.mwh > 0).length + b.individual_loads.filter((l) => l.mwh > 0).length + 1, 6);
}

function buildSankey(b: Balance, mode: "light" | "dark"): EChartsOption {
  const pal = palette(mode);
  const RED = mode === "dark" ? "#F87171" : "#EF4444";
  const GREEN = mode === "dark" ? "#34D399" : "#10B981";
  const BLUE = pal[0];
  const round = (v: number) => Math.round(v * 10) / 10;

  const nodes: { name: string; itemStyle?: { color: string } }[] = [
    { name: "Grid", itemStyle: { color: BLUE } },
    { name: "Furnaces", itemStyle: { color: RED } },
    { name: "Auxiliary", itemStyle: { color: GREEN } },
  ];
  const links: { source: string; target: string; value: number }[] = [
    { source: "Grid", target: "Furnaces", value: round(b.furnace_total_mwh) },
    { source: "Grid", target: "Auxiliary", value: round(b.auxiliary_mwh) },
  ];
  b.furnaces.forEach((f) => {
    if (f.mwh <= 0) return;
    nodes.push({ name: f.load_name });
    links.push({ source: "Furnaces", target: f.load_name, value: round(f.mwh) });
  });
  b.individual_loads.forEach((l) => {
    if (l.mwh <= 0) return;
    nodes.push({ name: l.load_name });
    links.push({ source: "Auxiliary", target: l.load_name, value: round(l.mwh) });
  });
  if (b.miscellaneous_mwh > 0) {
    nodes.push({ name: "Misc / Line loss", itemStyle: { color: "#94A3B8" } });
    links.push({ source: "Auxiliary", target: "Misc / Line loss", value: round(b.miscellaneous_mwh) });
  }

  return {
    tooltip: { trigger: "item", valueFormatter: (v) => `${fmtN(Number(v))} MWh` },
    series: [{
      type: "sankey", right: "8%", left: "1%", top: "3%", bottom: "3%",
      emphasis: { focus: "adjacency" }, nodeGap: 10, nodeWidth: 14,
      label: { color: mode === "dark" ? "#E7ECF6" : "#16202F", fontSize: 11, fontFamily: "Inter" },
      lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
      data: nodes, links,
    }],
  };
}

function buildCostBar(b: Balance, rate: number, mode: "light" | "dark"): EChartsOption {
  const rows = [...b.cost_centers].sort((a, c) => a.mwh - c.mwh);
  const pal = palette(mode);
  return {
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `₹ ${fmtN(Number(v))}` },
    xAxis: { type: "value", axisLabel: { formatter: (v: number) => `₹${(v / 1e5).toFixed(0)}L` }, splitLine: { lineStyle: { opacity: 0.4 } } },
    yAxis: { type: "category", data: rows.map((r) => r.sap_costcenter ?? r.description ?? "—"), axisLabel: { fontSize: 11 } },
    series: [{
      type: "bar", barMaxWidth: 20, itemStyle: { borderRadius: [0, 5, 5, 0] as [number, number, number, number], color: pal[0] },
      data: rows.map((r) => Math.round(r.mwh * 1000 * rate)),
      label: { show: true, position: "right", fontSize: 10,
        formatter: (p: { value: number }) => `₹${(p.value / 1e5).toFixed(1)}L` },
    }],
  } as EChartsOption;
}

/* ---------- small components ---------- */
function RateCard({ title, sub, r, tone, primary }: {
  title: string; sub: string; r: RateResult; tone: "info" | "warning" | "success"; primary?: boolean;
}) {
  const color = tone === "info" ? "#2563EB" : tone === "warning" ? "#F59E0B" : "#10B981";
  return (
    <Card className={primary ? "ring-1 ring-primary/40" : ""}>
      <CardBody className="pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <StatusChip tone={tone}>{sub}</StatusChip>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color }}>
          ₹ {r.per_unit_rate.toFixed(3)}<span className="text-sm font-medium text-muted-foreground"> /kWh</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Bill ₹ {(r.total / 1e7).toFixed(2)} Cr · {(r.kwh / 1e6).toFixed(2)} M kWh
          {r.level !== "ytd" && ` · LF ${r.load_factor_pct}%`}
        </div>
      </CardBody>
    </Card>
  );
}

function BillRow({ label, v }: { label: string; v: number }) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-1.5 text-muted-foreground">{label}</td>
      <td className={`py-1.5 text-right font-medium tabular-nums ${v < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>₹ {fmtN(v)}</td>
    </tr>
  );
}

/* ---------- helpers ---------- */
function fmtN(v: number) { return v.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(+y, +mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

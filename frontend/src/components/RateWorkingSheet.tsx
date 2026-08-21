import { Fragment, useState } from "react";
import { ChevronUp, Download, Gauge, IndianRupee, Sun, TrendingUp, Zap } from "lucide-react";
import type { FyMonths, RateResult } from "../api";

// Advanced in-page "bill working": highlights (incl. when max demand was hit) + ToD
// split + the full FTD/MTD/YTD sheet. Two views: Summary (amounts) and Detailed
// (Qty · Rate · Amount per period). kVAh↔MVAh / kVA↔MVA unit toggle.
type Rates = { ftd: RateResult; mtd: RateResult; ytd: RateResult };
type Scale = "k" | "M";
type Kind = "energy" | "kwh" | "demand" | "pct" | "days" | "money" | "rate";

const inr = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const num = (v: number, dp = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
// trim trailing zeros so a whole rate reads clean: 250.0000 → 250, 5.8000 → 5.8, 6.6975 → 6.6975
const trimZeros = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
const rup = (v: number, dp = 4) => `₹ ${trimZeros(v.toFixed(dp))}`;
const monthName = (ym: string) => {
  const [y, mo] = ym.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
};
const fmtWhen = (iso?: string | null) => (iso
  ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })
  : "—");
const unitLabel = (kind: Kind, s: Scale): string =>
  kind === "energy" ? (s === "M" ? "MVAh" : "kVAh")
    : kind === "kwh" ? (s === "M" ? "MWh" : "kWh")
      : kind === "demand" ? (s === "M" ? "MVA" : "kVA") : "";

const HEAD = "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100 font-semibold";

/* ---------- summary rows (single amount per period) ---------- */
type Row = { name: string; basis?: string; kind: Kind; section?: boolean; total?: boolean; subtotal?: boolean; rate?: boolean; get?: (r: RateResult) => number | null | undefined };
const ROWS: Row[] = [
  { name: "Inputs", kind: "money", section: true },
  { name: "Energy", kind: "energy", basis: "billed kVAh (register delta)", get: (r) => r.kvah },
  { name: "Energy", kind: "kwh", basis: "register kWh", get: (r) => r.kwh },
  { name: "Maximum Demand", kind: "demand", basis: "max 15-min block", get: (r) => r.md_kva },
  { name: "Billable Demand", kind: "demand", basis: "max(MD, 80% × Contract)", get: (r) => r.billable_kva },
  { name: "Contract Demand", kind: "demand", basis: "sanctioned", get: (r) => r.contract_kva },
  { name: "Load Factor (%)", kind: "pct", basis: "kWh ÷ (MD × hours)", get: (r) => r.load_factor_pct },
  { name: "Days (elapsed / in month)", kind: "days", basis: "billing proration", get: (r) => r.days_elapsed },
  { name: "Charges (₹)", kind: "money", section: true },
  { name: "Energy — up to {thr}% LF", kind: "money", basis: "slab-1 kVAh × higher rate", get: (r) => r.energy_slabs?.s1_amount },
  { name: "Energy — above {thr}% LF", kind: "money", basis: "slab-2 kVAh × lower rate", get: (r) => r.energy_slabs?.s2_amount },
  { name: "Net energy charge", kind: "money", basis: "slab-1 + slab-2", get: (r) => r.components?.energy, subtotal: true },
  { name: "ToD peak surcharge", kind: "money", basis: "+₹0.30 / kVAh (18–24 h)", get: (r) => r.components?.tod_surcharge },
  { name: "ToD solar incentive", kind: "money", basis: "−₹0.20 / kVAh (08–16 h)", get: (r) => r.components?.tod_incentive },
  { name: "Demand / MMFC", kind: "money", basis: "billable kVA × 250 × elapsed/DIM", get: (r) => r.components?.demand },
  { name: "Overdrawal penalty", kind: "money", basis: "max(MD − CD, 0) × 250", get: (r) => r.components?.overdrawal },
  { name: "High load-factor rebate", kind: "money", basis: "if LF above threshold", get: (r) => r.components?.lf_rebate },
  { name: "Electricity Duty (9%)", kind: "money", basis: "9% × (energy + ToD + rebate)", get: (r) => r.components?.electricity_duty },
  { name: "Meter rent", kind: "money", basis: "fixed, prorated", get: (r) => r.components?.meter_rent },
  { name: "Customer service charge", kind: "money", basis: "fixed, prorated", get: (r) => r.components?.customer_service_charge },
  { name: "Result", kind: "money", section: true },
  { name: "Total Bill (₹)", kind: "money", basis: "sum of charges", get: (r) => r.total, total: true },
  { name: "Billed Energy", kind: "kwh", basis: "for per-unit rate", get: (r) => r.kwh },
  { name: "Per-Unit Rate (₹/kWh)", kind: "rate", basis: "Total ÷ kWh", get: (r) => r.per_unit_rate, rate: true },
];

/* ---------- detailed rows (Qty · Rate · Amount) ---------- */
type DRow = {
  name: string; section?: boolean; total?: boolean; subtotal?: boolean; qk?: Kind;
  qty?: (r: RateResult) => number | null | undefined;
  rate?: (r: RateResult) => number | null | undefined; ratePct?: boolean;
  amount?: (r: RateResult) => number | null | undefined;
};
const nz = (v?: number | null) => (v == null ? null : v);
const DROWS: DRow[] = [
  { name: "Inputs", section: true },
  { name: "Apparent Energy", qk: "energy", qty: (r) => r.kvah },
  { name: "Active Energy", qk: "kwh", qty: (r) => r.kwh },
  { name: "Maximum Demand", qk: "demand", qty: (r) => r.md_kva },
  { name: "Billable Demand", qk: "demand", qty: (r) => r.billable_kva },
  { name: "Load Factor", qk: "pct", qty: (r) => r.load_factor_pct },
  { name: "Charges", section: true },
  { name: "Energy — up to {thr}% LF", qk: "energy", qty: (r) => r.energy_slabs?.s1_kvah, rate: (r) => r.energy_slabs?.s1_rate, amount: (r) => r.energy_slabs?.s1_amount },
  { name: "Energy — above {thr}% LF", qk: "energy", qty: (r) => r.energy_slabs?.s2_kvah, rate: (r) => r.energy_slabs?.s2_rate, amount: (r) => r.energy_slabs?.s2_amount },
  { name: "Net energy charge", qk: "energy", subtotal: true, qty: (r) => r.kvah, rate: (r) => (r.components?.energy && r.kvah ? r.components.energy / r.kvah : null), amount: (r) => r.components?.energy },
  { name: "ToD peak surcharge", qk: "energy", qty: (r) => r.peak_kvah, rate: () => 0.30, amount: (r) => r.components?.tod_surcharge },
  { name: "ToD solar incentive", qk: "energy", qty: (r) => r.solar_kvah, rate: () => -0.20, amount: (r) => r.components?.tod_incentive },
  { name: "Demand / MMFC", qk: "demand", qty: (r) => r.billable_kva, rate: () => 250, amount: (r) => r.components?.demand },
  { name: "Overdrawal penalty", qk: "demand", qty: (r) => Math.max((r.md_kva ?? 0) - (r.contract_kva ?? 0), 0), rate: () => 250, amount: (r) => r.components?.overdrawal },
  { name: "High load-factor rebate", amount: (r) => r.components?.lf_rebate },
  { name: "Electricity Duty", rate: () => 9, ratePct: true, amount: (r) => r.components?.electricity_duty },
  { name: "Meter rent", amount: (r) => r.components?.meter_rent },
  { name: "Customer service charge", amount: (r) => r.components?.customer_service_charge },
  { name: "Result", section: true },
  { name: "Total Bill", total: true, amount: (r) => r.total },
  { name: "Per-Unit Rate", rate: (r) => r.per_unit_rate, amount: () => null },
];

const COLS: { key: keyof Rates; label: string }[] = [
  { key: "ftd", label: "FTD" }, { key: "mtd", label: "MTD" }, { key: "ytd", label: "YTD" },
];
const DCOLS: { key: keyof Rates; label: string }[] = [{ key: "ftd", label: "FTD" }, { key: "mtd", label: "MTD" }];

export default function RateWorkingSheet({ rates, fyMonths, monthLabel, onClose }: {
  rates: Rates; fyMonths?: FyMonths | null; monthLabel: string; onClose: () => void;
}) {
  const [scale, setScale] = useState<Scale>("k");
  const [view, setView] = useState<"summary" | "detailed">("detailed");
  const m = rates.mtd;
  const contractPct = m.contract_kva ? (m.md_kva / m.contract_kva) * 100 : 0;
  const todTotal = (m.solar_kvah ?? 0) + (m.normal_kvah ?? 0) + (m.peak_kvah ?? 0);
  const div = scale === "M" ? 1000 : 1;
  const todV = (v: number) => (scale === "M" ? num(v / 1000, 1) : num(v));
  const thr = trimZeros((m.energy_slabs?.threshold_pct ?? 60).toFixed(2));
  const sub = (name: string) => name.replace("{thr}", thr);   // fill the LF threshold into slab labels

  const qtyText = (kind: Kind | undefined, v: number | null): string => {
    if (v == null) return "";
    if (kind === "energy" || kind === "kwh") return num(v / div, scale === "M" ? 1 : 0);
    if (kind === "demand") return num(v / div, scale === "M" ? 2 : 0);
    if (kind === "pct") return `${num(v, 1)}%`;
    return num(v);
  };
  const rowLabel = (name: string, kind?: Kind) => {
    name = sub(name);
    return kind && ["energy", "kwh", "demand"].includes(kind) ? `${name} — ${unitLabel(kind, scale)}` : name;
  };
  const uom = (row: DRow): string => {
    if (row.qk === "energy") return unitLabel("energy", scale);
    if (row.qk === "kwh") return unitLabel("kwh", scale);
    if (row.qk === "demand") return unitLabel("demand", scale);
    if (row.qk === "pct") return "%";
    if (row.name === "Per-Unit Rate") return "₹/kWh";
    return "₹";
  };

  // summary cell
  const cellText = (row: Row, r: RateResult): string => {
    const v = row.get?.(r);
    if (v == null) return "—";
    switch (row.kind) {
      case "energy": case "kwh": return num(v / div, scale === "M" ? 1 : 0);
      case "demand": return num(v / div, scale === "M" ? 2 : 0);
      case "pct": return num(v, 1);
      case "days": return num(v, 1);
      case "rate": return rup(v);
      default: return `₹ ${inr(v)}`;
    }
  };

  const exportCsv = () => {
    const head = ["Line Item", "Basis", ...COLS.map((c) => c.label)];
    const lines = [head.join(",")];
    for (const row of ROWS) {
      if (row.section) { lines.push(`"${row.name}",,,,`); continue; }
      const cells = COLS.map((c) => `"${cellText(row, rates[c.key]).replace(/₹\s?/g, "")}"`);
      lines.push([`"${rowLabel(row.name, row.kind)}"`, `"${row.basis ?? ""}"`, ...cells].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `bill-working-${monthLabel.replace(/\s/g, "-")}-${scale}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div>
          <div className="text-sm font-semibold">Tariff / Bill Working — {monthLabel}</div>
          <div className="text-xs text-muted-foreground">TPNODL bill on the 132 kV incomer · FTD / MTD / YTD line items</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg text-xs" title="Amounts only, or Qty · Rate · Amount">
            <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Summary</button>
            <button className={view === "detailed" ? "active" : ""} onClick={() => setView("detailed")}>Detailed</button>
          </div>
          <div className="seg text-xs" title="kilo or mega units">
            <button className={scale === "k" ? "active" : ""} onClick={() => setScale("k")}>kVAh · kVA</button>
            <button className={scale === "M" ? "active" : ""} onClick={() => setScale("M")}>MVAh · MVA</button>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={exportCsv}><Download size={13} /> CSV</button>
          <button className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={onClose}><ChevronUp size={13} /> Hide</button>
        </div>
      </div>

      {/* highlights */}
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Stat icon={<TrendingUp size={16} />} tone="danger" label="Max Demand Reached"
          value={`${(m.md_kva / 1000).toFixed(2)} MVA`} sub={<span>on <b className="text-foreground">{fmtWhen(m.md_at)}</b></span>} />
        <Stat icon={<Gauge size={16} />} tone="warning" label="Contract Utilisation"
          value={`${contractPct.toFixed(1)}%`} sub={<span>{(m.md_kva / 1000).toFixed(1)} / {(m.contract_kva / 1000).toFixed(0)} MVA</span>} />
        <Stat icon={<Zap size={16} />} tone="info" label="Load Factor"
          value={`${m.load_factor_pct.toFixed(1)}%`} sub={<span>peak-adjusted (MTD)</span>} />
        <Stat icon={<IndianRupee size={16} />} tone="neutral" label="Total Bill (MTD)"
          value={`₹ ${(m.total / 1e7).toFixed(2)} Cr`} sub={<span>{num(m.days_elapsed, 0)} of {m.days_in_month} days · {rup(m.per_unit_rate, 3)}/kWh</span>} />
      </div>

      {/* ToD split */}
      {todTotal > 0 && (
        <div className="px-4 pb-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Sun size={13} /> Time-of-Day consumption ({unitLabel("energy", scale)})</div>
          <div className="flex h-7 w-full overflow-hidden rounded-lg text-[11px] font-semibold text-white">
            <Seg w={(m.solar_kvah ?? 0) / todTotal} c="#F59E0B" label={`Solar ${todV(m.solar_kvah ?? 0)}`} />
            <Seg w={(m.normal_kvah ?? 0) / todTotal} c="#10B981" label={`Normal ${todV(m.normal_kvah ?? 0)}`} />
            <Seg w={(m.peak_kvah ?? 0) / todTotal} c="#EF4444" label={`Peak ${todV(m.peak_kvah ?? 0)}`} />
          </div>
        </div>
      )}

      {/* sheet */}
      <div className="overflow-auto border-t">
        {view === "summary" ? (
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="sticky top-0 z-10">
              <tr className={`text-xs uppercase tracking-wide ${HEAD}`}>
                <th className="border px-3 py-2 text-left">Line Item</th>
                <th className="border px-3 py-2 text-left">Basis / Formula</th>
                {COLS.map((c) => <th key={c.key} className="border px-3 py-2 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => row.section ? (
                <tr key={i} className="bg-primary/10"><td className="border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary" colSpan={2 + COLS.length}>{row.name}</td></tr>
              ) : (
                <tr key={i} className={`${row.total || row.rate ? "font-bold" : ""} ${row.subtotal ? "bg-muted/40 font-semibold" : ""}`}>
                  <td className={`border px-3 py-1.5 ${row.rate ? "text-primary" : ""}`}>{rowLabel(row.name, row.kind)}</td>
                  <td className="border px-3 py-1.5 text-xs text-muted-foreground">{row.basis}</td>
                  {COLS.map((c) => { const t = cellText(row, rates[c.key]); const neg = t.includes("-");
                    return <td key={c.key} className={`border px-3 py-1.5 text-right ${row.rate ? "text-primary" : neg ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{t}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="sticky top-0 z-10">
              <tr className="text-xs uppercase tracking-wide">
                <th className={`border px-3 py-2 text-left ${HEAD}`} rowSpan={2}>Line Item</th>
                <th className={`border px-3 py-2 text-center ${HEAD}`} rowSpan={2}>UOM</th>
                {DCOLS.map((c) => (
                  <th key={c.key} colSpan={3}
                    className={`border px-3 py-1.5 text-center font-bold ${c.key === "ftd" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] uppercase">
                {DCOLS.map((c) => <FragmentCols key={c.key} tint={c.key as "ftd" | "mtd"} />)}
              </tr>
            </thead>
            <tbody>
              {DROWS.map((row, i) => row.section ? (
                <tr key={i} className="bg-primary/10"><td className="border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary" colSpan={2 + DCOLS.length * 3}>{row.name}</td></tr>
              ) : (
                <tr key={i} className={`${row.total ? "font-bold" : ""} ${row.subtotal ? "bg-muted/40 font-semibold" : ""}`}>
                  <td className={`border px-3 py-1.5 ${row.name === "Per-Unit Rate" ? "text-primary" : ""}`}>{sub(row.name)}</td>
                  <td className="border px-3 py-1.5 text-center text-xs text-muted-foreground">{uom(row)}</td>
                  {DCOLS.map((c) => {
                    const r = rates[c.key];
                    const q = nz(row.qty?.(r)); const rt = nz(row.rate?.(r)); const amt = nz(row.amount?.(r));
                    const rateStr = rt == null ? "" : row.ratePct ? `${rt}%` : rup(rt);
                    return (
                      <FragmentCells key={c.key} tint={c.key as "ftd" | "mtd"}
                        qty={qtyText(row.qk, q)} rate={rateStr}
                        amount={amt == null ? "" : `₹ ${inr(amt)}`} negAmount={(amt ?? 0) < 0} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Financial-year month-by-month — full FY(s), with load & power factor */}
      {(() => {
        const src: FyMonths | null = fyMonths ?? (rates.ytd.months?.length
          ? { start: "", end: "", months: rates.ytd.months as unknown as FyMonths["months"],
              fys: [], total: rates.ytd.total, kwh: rates.ytd.kwh, per_unit_rate: rates.ytd.per_unit_rate }
          : null);
        if (!src || !src.months.length) return null;
        const ms = src.months;
        const groups: { fy: string; rows: FyMonths["months"] }[] = [];
        for (const m of ms) {
          const fy = m.fy || "FY";
          let g = groups.find((x) => x.fy === fy);
          if (!g) { g = { fy, rows: [] }; groups.push(g); }
          g.rows.push(m);
        }
        const multi = groups.length > 1;
        const rateVals = ms.map((x) => x.per_unit_rate);
        const minR = Math.min(...rateVals), maxR = Math.max(...rateVals);
        const cheapest = ms.reduce((a, b) => (b.per_unit_rate < a.per_unit_rate ? b : a));
        const costliest = ms.reduce((a, b) => (b.per_unit_rate > a.per_unit_rate ? b : a));
        const spread = maxR - minR;
        const nCols = 8;
        let prev: number | null = null;
        const title = multi ? `Month-by-month — ${groups.map((g) => g.fy).join(" + ")}` : `${groups[0].fy} — month-by-month`;
        const energyCell = (v: number) => num(v / div, scale === "M" ? 1 : 0);
        return (
          <div className="border-t p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
              <div className="text-[11px] text-muted-foreground">
                Source: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">GET /api/rate/fy-months</code> · full financial year
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead><tr className={`text-xs uppercase ${HEAD}`}>
                  <th className="border px-3 py-1.5 text-left">Month</th>
                  <th className="border px-3 py-1.5 text-right">Bill (₹)</th>
                  <th className="border px-3 py-1.5 text-left">Share of FY</th>
                  <th className="border px-3 py-1.5 text-right">Energy ({unitLabel("kwh", scale)})</th>
                  <th className="border px-3 py-1.5 text-right">₹/kWh</th>
                  <th className="border px-3 py-1.5 text-right">Load Factor</th>
                  <th className="border px-3 py-1.5 text-right">Power Factor</th>
                  <th className="border px-3 py-1.5 text-center">MoM</th>
                </tr></thead>
                <tbody>
                  {groups.map((g) => {
                    const gTotal = g.rows.reduce((s, m) => s + m.total, 0);
                    const gUnits = g.rows.reduce((s, m) => s + m.kwh, 0);
                    const gMaxBill = Math.max(...g.rows.map((m) => m.total), 1);
                    return (
                      <Fragment key={g.fy}>
                        {multi && (
                          <tr className="bg-primary/5"><td colSpan={nCols} className="border px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">{g.fy}</td></tr>
                        )}
                        {g.rows.map((mo) => {
                          const delta = prev == null ? null : mo.per_unit_rate - prev; prev = mo.per_unit_rate;
                          const best = mo.per_unit_rate === minR, worst = mo.per_unit_rate === maxR;
                          const share = gTotal ? (mo.total / gTotal) * 100 : 0;
                          return (
                            <tr key={mo.month}>
                              <td className="border px-3 py-1.5 font-medium">{monthName(mo.month)}</td>
                              <td className="border px-3 py-1.5 text-right">{inr(mo.total)}</td>
                              <td className="border px-3 py-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${(mo.total / gMaxBill) * 100}%` }} />
                                  </div>
                                  <span className="w-9 shrink-0 text-right text-[11px] text-muted-foreground">{share.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td className="border px-3 py-1.5 text-right">{energyCell(mo.kwh)}</td>
                              <td className={`border px-3 py-1.5 text-right font-semibold ${best ? "text-emerald-600 dark:text-emerald-400" : worst ? "text-red-600 dark:text-red-400" : ""}`}>
                                {rup(mo.per_unit_rate)}{best ? " ▼" : worst ? " ▲" : ""}
                              </td>
                              <td className="border px-3 py-1.5 text-right">{mo.load_factor_pct != null ? `${num(mo.load_factor_pct, 1)}%` : "—"}</td>
                              <td className="border px-3 py-1.5 text-right">{mo.power_factor != null ? trimZeros(mo.power_factor.toFixed(3)) : "—"}</td>
                              <td className="border px-3 py-1.5 text-center text-xs">
                                {delta == null ? <span className="text-muted-foreground">—</span> : (
                                  <span className={delta > 0.0001 ? "text-red-600 dark:text-red-400" : delta < -0.0001 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                                    {delta > 0.0001 ? "▲" : delta < -0.0001 ? "▼" : "•"} {trimZeros(Math.abs(delta).toFixed(4))}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/40 font-semibold">
                          <td className="border px-3 py-1.5">{g.fy} total</td>
                          <td className="border px-3 py-1.5 text-right">{inr(gTotal)}</td>
                          <td className="border px-3 py-1.5 text-[11px] font-normal text-muted-foreground">100% · blended</td>
                          <td className="border px-3 py-1.5 text-right">{energyCell(gUnits)}</td>
                          <td className="border px-3 py-1.5 text-right text-primary">{rup(gUnits ? gTotal / gUnits : 0)}</td>
                          <td className="border px-3 py-1.5" colSpan={3} />
                        </tr>
                      </Fragment>
                    );
                  })}
                  {multi && (
                    <tr className="font-bold">
                      <td className="border px-3 py-1.5">Grand total</td>
                      <td className="border px-3 py-1.5 text-right">{inr(src.total)}</td>
                      <td className="border px-3 py-1.5" />
                      <td className="border px-3 py-1.5 text-right">{energyCell(src.kwh)}</td>
                      <td className="border px-3 py-1.5 text-right text-primary">{rup(src.per_unit_rate)}</td>
                      <td className="border px-3 py-1.5" colSpan={3} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* analytics strip */}
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <MiniStat label="Cheapest month" value={monthName(cheapest.month)} note={`${rup(cheapest.per_unit_rate)}/kWh`} tone="success" />
              <MiniStat label="Costliest month" value={monthName(costliest.month)} note={`${rup(costliest.per_unit_rate)}/kWh`} tone="danger" />
              <MiniStat label="Rate spread" value={`${trimZeros(spread.toFixed(4))}`} note="max − min ₹/kWh" tone="warning" />
              <MiniStat label="Blended (FY)" value={`${rup(src.per_unit_rate)}`} note={`over ${ms.length} month${ms.length > 1 ? "s" : ""}`} tone="info" />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const TINT = { ftd: "bg-blue-500/5", mtd: "bg-amber-500/5" } as const;
const THT = {
  ftd: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  mtd: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
} as const;
const FragmentCols = ({ tint }: { tint: "ftd" | "mtd" }) => (
  <>
    <th className={`border px-2 py-1 text-right font-semibold ${THT[tint]}`}>Qty</th>
    <th className={`border px-2 py-1 text-right font-semibold ${THT[tint]}`}>Rate</th>
    <th className={`border px-2 py-1 text-right font-semibold ${THT[tint]}`}>Amount</th>
  </>
);
const FragmentCells = ({ qty, rate, amount, negAmount, tint }: { qty: string; rate: string; amount: string; negAmount: boolean; tint: "ftd" | "mtd" }) => (
  <>
    <td className={`border px-3 py-1.5 text-right tabular-nums ${TINT[tint]}`}>{qty || "—"}</td>
    <td className={`border px-3 py-1.5 text-right text-xs text-muted-foreground ${TINT[tint]}`}>{rate || "—"}</td>
    <td className={`border px-3 py-1.5 text-right font-medium ${TINT[tint]} ${negAmount ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{amount || "—"}</td>
  </>
);

const TONE: Record<string, string> = { danger: "#EF4444", warning: "#F59E0B", info: "#2563EB", success: "#10B981", neutral: "#64748B" };
function Stat({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: keyof typeof TONE; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span style={{ color: TONE[tone] }}>{icon}</span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: TONE[tone] }}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
function MiniStat({ label, value, note, tone }: { label: string; value: string; note?: string; tone: keyof typeof TONE }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: TONE[tone] }}>{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}
function Seg({ w, c, label }: { w: number; c: string; label: string }) {
  if (w <= 0) return null;
  return <div className="flex items-center justify-center" style={{ width: `${w * 100}%`, background: c }} title={label}>{w > 0.12 ? label : ""}</div>;
}

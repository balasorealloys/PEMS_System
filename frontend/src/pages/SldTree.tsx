import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Activity, AlertTriangle, Boxes, ChevronLeft, Cpu, Gauge, Network, RotateCw, Table2, Zap,
} from "lucide-react";
import { api, type SldNode, type SldTree as SldTreeT } from "../api";
import { KPICard, Card, CardHead, CardBody, ChartFrame, EChart, StatusChip, LoadingState } from "../components/premium";
import SldFlow, { sldKey, type Orient } from "../components/premium/SldFlow";
import SldOrgChart from "../components/premium/SldOrgChart";
import { useThemeMode } from "../hooks/useThemeMode";
import { axisColors } from "../design-system/charts";

type SldView = "flow" | "tree";

type Mode = "role" | "cc";

const ROLE_COLOR: Record<string, string> = {
  grid: "#2563EB", furnace: "#EF4444", incomer: "#7C3AED", aux: "#10B981", unknown: "#64748B",
};
const CC_PALETTE = ["#2563EB", "#06B6D4", "#10B981", "#F59E0B", "#7C3AED", "#EF4444",
  "#0EA5E9", "#EC4899", "#14B8A6", "#EAB308", "#A855F7", "#F97316", "#60A5FA", "#4ADE80", "#E879F9", "#94A3B8"];

const fmtP = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${kw.toFixed(0)} kW`);

export default function SldTree({ onBack }: { onBack: () => void }) {
  const [t, setT] = useState<SldTreeT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("role");
  const [sldView, setSldView] = useState<SldView>("flow");
  const [orientation, setOrientation] = useState<Orient>("LR");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const themeMode = useThemeMode();

  useEffect(() => { api.sld().then(setT).catch((e) => setErr(String(e))); }, []);

  const parentKeys = useMemo(() => {
    const ks: string[] = [];
    const walk = (n: SldNode) => { if (n.children.length) { ks.push(sldKey(n)); n.children.forEach(walk); } };
    t?.roots.forEach(walk); return ks;
  }, [t]);

  const ccColor = useMemo(() => {
    const set = new Set<string>();
    const walk = (n: SldNode) => { if (n.sld_costcenter) set.add(n.sld_costcenter); n.children.forEach(walk); };
    t?.roots.forEach(walk); t?.unlinked.forEach(walk);
    const codes = [...set].sort();
    return (cc: string | null) => (cc ? CC_PALETTE[codes.indexOf(cc) % CC_PALETTE.length] : "#64748B");
  }, [t]);

  const analysis = useMemo(() => {
    if (!t) return null;
    const flat: SldNode[] = [];
    const walk = (n: SldNode) => { flat.push(n); n.children.forEach(walk); };
    t.roots.forEach(walk);
    const contributors = flat.filter((n) => (n.loss_kw ?? 0) > 0)
      .sort((a, b) => (b.loss_kw ?? 0) - (a.loss_kw ?? 0)).slice(0, 5);
    const byCat: Record<string, number> = {};
    flat.forEach((n) => {
      if ((n.loss_kw ?? 0) > 0) {
        const cat = n.role === "grid" || n.role === "incomer" ? "Transformer / Line" : "Panel / Distribution";
        byCat[cat] = (byCat[cat] ?? 0) + (n.loss_kw ?? 0);
      }
    });
    return { contributors, byCat };
  }, [t]);

  const colorOf = useMemo(() =>
    (n: SldNode) => (mode === "role" ? ROLE_COLOR[n.role] ?? ROLE_COLOR.unknown : ccColor(n.sld_costcenter)),
    [mode, ccColor]);
  const toggle = useMemo(() => (k: string) =>
    setCollapsed((p) => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; }), []);

  const efficiency = t && t.totals.incoming_kw ? (t.totals.transmitted_kw / t.totals.incoming_kw) * 100 : 0;
  const lossOpt = useMemo<EChartsOption | null>(
    () => (analysis ? buildLossPie(analysis.byCat, themeMode) : null), [analysis, themeMode]);
  const gaugeOpt = useMemo<EChartsOption>(() => buildGauge(efficiency, themeMode), [efficiency, themeMode]);

  if (err) return <div className="error">Failed to load: {err}</div>;
  if (!t) return <LoadingState label="Building hierarchy…" />;
  const T = t.totals;

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <div className="crumb" onClick={onBack}><ChevronLeft size={14} /> <span>Feeder Mapping</span></div>
          <h1>Single-Line Diagram &amp; Transmission Loss</h1>
          <div className="sub">132 kV Main Incomer hierarchy — live power flow &amp; loss at every level.</div>
        </div>
        <div className="head-controls">
          <div className="seg">
            <button className={mode === "role" ? "active" : ""} onClick={() => setMode("role")}><Cpu size={14} /> Electrical</button>
            <button className={mode === "cc" ? "active" : ""} onClick={() => setMode("cc")}><Boxes size={14} /> Cost Center</button>
          </div>
          <button className="btn" onClick={onBack}><Table2 size={15} /> Table</button>
        </div>
      </div>

      {/* single-line diagram — React Flow (default) or the classic indented tree */}
      <ChartFrame
        title="Single-Line Diagram"
        defaultHeight={580}
        zoomable={sldView === "tree"}
        viewToggle={
          <div className="flex items-center gap-2">
            <div className="seg">
              <button className={sldView === "flow" ? "active" : ""} onClick={() => setSldView("flow")}>Diagram</button>
              <button className={sldView === "tree" ? "active" : ""} onClick={() => setSldView("tree")}>Tree</button>
            </div>
            {sldView === "flow" && (
              <button className="btn small" title={orientation === "LR" ? "Rotate to top-down" : "Rotate to left-right"}
                onClick={() => setOrientation((o) => (o === "LR" ? "TB" : "LR"))}>
                <RotateCw size={14} /> Rotate
              </button>
            )}
            <button className="btn small" onClick={() => setCollapsed(new Set())}>Expand all</button>
            <button className="btn small" onClick={() => setCollapsed(new Set(parentKeys))}>Collapse all</button>
          </div>
        }
      >
        {({ height }) => (sldView === "flow"
          ? <SldFlow roots={t.roots} mode={mode} collapsed={collapsed} onToggle={toggle} colorOf={colorOf} height={height} orientation={orientation} />
          : <SldOrgChart roots={t.roots} mode={mode} collapsed={collapsed} onToggle={toggle} colorOf={colorOf} />)}
      </ChartFrame>

      {t.unlinked.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {t.unlinked.length} feeder(s) not placed in the diagram (no parent in the SLD):{" "}
          {t.unlinked.map((u) => `${u.feeder_name} (${u.device_id}/${u.feeder_id})`).join(", ")}
        </div>
      )}

      {/* KPI totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Total Incoming" tone="info" icon={<Zap size={17} />} value={T.incoming_kw / 1000} unit="MW" decimals={2} footnote={<span>100%</span>} />
        <KPICard label="Transmitted" tone="success" icon={<Activity size={17} />} value={T.transmitted_kw / 1000} unit="MW" decimals={2} footnote={<span>{efficiency.toFixed(2)}% efficient</span>} />
        <KPICard label="Total Loss" tone="danger" icon={<AlertTriangle size={17} />} value={T.loss_kw / 1000} unit="MW" decimals={2} footnote={<span>{T.loss_pct}%</span>} />
        <KPICard label="Feeders" tone="info" icon={<Network size={17} />} value={T.feeders} footnote={<span>tracked</span>} />
        <KPICard label="Nodes / Panels" tone="neutral" icon={<Cpu size={17} />} value={T.panels} footnote={<span>with children</span>} />
        <KPICard label="Equipment" tone="warning" icon={<Boxes size={17} />} value={T.equipment} footnote={<span>leaf loads</span>} />
      </div>

      {/* summary */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHead title="Loss Summary" icon={<AlertTriangle size={16} />} />
          <CardBody>{lossOpt && <EChart option={lossOpt} height={200} />}</CardBody>
        </Card>
        <Card>
          <CardHead title="Top Loss Contributors" />
          <CardBody className="px-0">
            <table className="w-full text-sm">
              <tbody>
                {analysis!.contributors.map((n, i) => (
                  <tr key={sldKey(n)} className="border-b border-border/40 last:border-0">
                    <td className="w-8 px-5 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2">{n.feeder_name}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{fmtP(n.loss_kw ?? 0)}</td>
                    <td className="px-5 py-2 text-right text-xs text-red-500">{n.loss_pct}%</td>
                  </tr>
                ))}
                {analysis!.contributors.length === 0 && (
                  <tr><td className="px-5 py-3 text-muted-foreground">No positive losses detected.</td></tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHead title="System Health" icon={<Gauge size={16} />} />
          <CardBody>
            <EChart option={gaugeOpt} height={160} />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <StatusChip tone="success" dot>{T.feeders} feeders</StatusChip>
              <StatusChip tone="info" dot>{T.panels} nodes</StatusChip>
              <StatusChip tone="warning" dot>{T.equipment} equipment</StatusChip>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ---------- charts ---------- */
function buildLossPie(byCat: Record<string, number>, mode: "light" | "dark"): EChartsOption {
  const ax = axisColors(mode);
  const colors = ["#2563EB", "#F59E0B", "#7C3AED", "#06B6D4"];
  const data = Object.entries(byCat).map(([name, v], i) => ({
    name, value: Math.round(v), itemStyle: { color: colors[i % colors.length] },
  }));
  return {
    tooltip: { trigger: "item", valueFormatter: (v) => `${(Number(v) / 1000).toFixed(2)} MW` },
    legend: { bottom: 0, icon: "circle", textStyle: { color: ax.text, fontSize: 11 } },
    series: [{
      type: "pie", radius: ["50%", "72%"], center: ["50%", "42%"],
      itemStyle: { borderColor: mode === "dark" ? "#121829" : "#fff", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: data.length ? data : [{ name: "No losses", value: 1, itemStyle: { color: ax.grid } }],
    }],
  };
}

function buildGauge(efficiency: number, mode: "light" | "dark"): EChartsOption {
  const ax = axisColors(mode);
  return {
    series: [{
      type: "gauge", startAngle: 210, endAngle: -30, min: 90, max: 100, radius: "92%", center: ["50%", "62%"],
      progress: { show: true, width: 12, itemStyle: { color: "#10B981" } },
      axisLine: { lineStyle: { width: 12, color: [[1, ax.grid]] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false },
      anchor: { show: false }, title: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, 0], fontSize: 22, fontWeight: "bold",
        formatter: "{value}%", color: ax.text },
      data: [{ value: +efficiency.toFixed(1) }],
    }],
  };
}

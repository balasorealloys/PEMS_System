import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import {
  Activity, AlertTriangle, BatteryCharging, Bell, CheckCircle2, Download, Gauge,
  IndianRupee, Receipt, TrendingDown, Zap,
} from "lucide-react";
import { api, type Executive } from "../api";
import { useExecutive, useAlerts } from "../hooks/queries";
import { useAuth } from "../stores/auth";
import { useScope } from "../stores/scope";
import { KPICard, Card, CardHead, CardBody, EChart, StatusChip, LoadingState } from "../components/premium";
import type { Tone } from "../design-system/status";
import { palette, axisColors } from "../design-system/charts";
import { useThemeMode } from "../hooks/useThemeMode";

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export default function Dashboard() {
  const { range } = useScope();
  // always follow the header date-range picker's full start–end scope; the backend
  // aggregates over the whole window (a single day when start === end).
  const { data: d, error } = useExecutive(range.start, range.end);
  const { data: alerts } = useAlerts();
  const firstName = titleCase((useAuth((s) => s.user)?.name || "").split(/\s+/)[0] || "there");
  const [costToday, setCostToday] = useState<number | null>(null);
  const [expectedBill, setExpectedBill] = useState<number | null>(null);
  const mode = useThemeMode();

  useEffect(() => {
    setCostToday(null); setExpectedBill(null);
    if (!d?.date) return;
    if (d.is_range && d.range) {
      api.sapPreviewRange(d.range.start, d.range.end).then((p) => setCostToday(p.total_amount)).catch(() => {});
    } else {
      api.sapPreview(d.date.slice(0, 10)).then((p) => setCostToday(p.total_amount)).catch(() => {});
    }
    api.recon(d.date.slice(0, 7)).then((r) => setExpectedBill(r.computed_total)).catch(() => {});
  }, [d?.date, d?.is_range, d?.range?.start, d?.range?.end]);

  const spark = useMemo(
    () => (d ? d.demand_trend.filter((x) => x.today_mw != null).map((x) => x.today_mw) : []), [d]);
  const demandOpt = useMemo<EChartsOption | null>(() => (d ? buildDemand(d, mode) : null), [d, mode]);
  const todOpt = useMemo<EChartsOption | null>(() => (d ? buildTod(d, mode) : null), [d, mode]);
  const feedersOpt = useMemo<EChartsOption | null>(() => (d ? buildFeeders(d, mode) : null), [d, mode]);

  if (error) return <div className="error">Failed to load dashboard: {String(error)}</div>;
  if (!d) return <LoadingState label="Loading live plant data…" />;
  if (d.as_of == null) {
    return <div className="muted">No meter data for {d.range ? `${fmtDate(d.range.start)} – ${fmtDate(d.range.end)}` : "today"}.</div>;
  }
  const periodLabel = d.range ? `${fmtDate(d.range.start)} – ${fmtDate(d.range.end)}` : fmtDate(d.date!);

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>{d.is_range ? "Period Summary" : d.live ? timeOfDayGreeting(d.as_of) : "Snapshot"}, {firstName} 👋</h1>
          <div className="sub">
            {d.is_range
              ? <>Summary for {periodLabel}{d.live ? " (in progress — today's data is still coming in)" : ""}.</>
              : d.live
                ? <>Here's the live picture of your plant — {periodLabel}.</>
                : <>Historical snapshot for {periodLabel}.</>}
          </div>
        </div>
        <div className="head-controls">
          <button className="btn primary"><Download size={15} /> Export</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPICard label={d.is_range ? "Demand (range end)" : "Current Demand"} tone="info" icon={<Zap size={17} />}
          value={d.demand.mw} unit="MW" decimals={1} spark={d.is_range ? undefined : spark}
          footnote={<span>{d.demand.utilization_pct}% of {(d.demand.contract_kva / 1000).toFixed(0)} MVA</span>} />
        <KPICard label="Power Factor" tone={pfTone(d.power_factor)} icon={<Gauge size={17} />}
          value={d.power_factor ?? 0} decimals={3}
          footnote={<StatusChip tone={pfTone(d.power_factor)}>{pfLabel(d.power_factor)}</StatusChip>} />
        <KPICard label={d.is_range ? "Period Consumption" : "Today's Consumption"} tone="info" icon={<Activity size={17} />}
          value={d.consumption.today_mwh ?? 0} unit="MWh" decimals={1} spark={spark}
          delta={d.consumption.change_pct} deltaSuffix={d.is_range ? "vs prev period" : "vs yest"} deltaGoodWhenUp={false} />
        <KPICard label="Load Factor" tone="success" icon={<BatteryCharging size={17} />}
          value={d.load_factor ?? 0} decimals={2} footnote={<span>peak-adjusted, {d.is_range ? "this period" : "today"}</span>} />
        <KPICard label={d.is_range ? "Energy Cost (Period)" : "Energy Cost (Today)"} tone="warning" icon={<IndianRupee size={17} />}
          value={costToday != null ? costToday / 100000 : "…"} unit={costToday != null ? "L" : ""}
          prefix={costToday != null ? "₹ " : ""} decimals={2} pending={costToday == null}
          footnote={<span>{d.is_range ? "cost-center total, whole period" : "daily cost-center total"}</span>} />
        <KPICard label="Expected Monthly Bill" tone="danger" icon={<Receipt size={17} />}
          value={expectedBill != null ? expectedBill / 1e7 : "…"} unit={expectedBill != null ? "Cr" : ""}
          prefix={expectedBill != null ? "₹ " : ""} decimals={2} pending={expectedBill == null}
          footnote={<span>rebuilt from meter data</span>} />
      </div>

      {/* Row 1: demand trend + alerts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead title={d.is_range ? "Daily Consumption Trend" : "24-Hour Demand Trend"} icon={<TrendingDown size={16} />}
            right={<span className="text-xs text-muted-foreground">
              {d.is_range ? "MWh · This period vs previous period" : "MW · Today vs Yesterday"}
            </span>} />
          <CardBody>{demandOpt && <EChart option={demandOpt} height={260} />}</CardBody>
        </Card>
        <Card>
          <CardHead title="Alerts" icon={<Bell size={16} />}
            right={!alerts
              ? null
              : alerts.count > 0
                ? <StatusChip tone="warning" dot>{alerts.count} active</StatusChip>
                : <StatusChip tone="success" dot>all clear</StatusChip>} />
          <CardBody className="space-y-2">
            {!alerts ? <LoadingState label="Checking alerts…" className="py-6" /> : alerts.alerts.length > 0 ? alerts.alerts.map((a) => {
              const c = a.severity === "critical" ? "#EF4444" : a.severity === "warning" ? "#F59E0B" : "#2563EB";
              const AIcon = a.severity === "info" ? Bell : AlertTriangle;
              return (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border p-2.5">
                  <span className="mt-0.5 shrink-0" style={{ color: c }}><AIcon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.message}</div>
                  </div>
                </div>
              );
            }) : (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <CheckCircle2 size={22} className="text-emerald-500" />
                <div className="text-sm font-medium">All clear</div>
                <div className="text-[11px] text-muted-foreground">No active alerts right now.</div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Row 2: TOD + top feeders + power quality */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHead title="TOD Consumption" right={<span className="text-xs text-muted-foreground">{!d.is_range && d.live ? "Today" : periodLabel}</span>} />
          <CardBody>{todOpt && <EChart option={todOpt} height={230} />}</CardBody>
        </Card>
        <Card>
          <CardHead title="Top Consuming Feeders" right={<span className="text-xs text-muted-foreground">avg MW · {!d.is_range && d.live ? "today" : periodLabel}</span>} />
          <CardBody>{feedersOpt && <EChart option={feedersOpt} height={230} />}</CardBody>
        </Card>
        <Card>
          <CardHead title="Power Quality" icon={<Gauge size={16} />}
            right={d.live && !d.is_range
              ? <StatusChip tone="success" dot pulse>Live</StatusChip>
              : <StatusChip tone="info" dot>As of {d.is_range ? fmtDate(d.range!.end) : fmtDate(d.date!)}</StatusChip>} />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              <Pq l="Power Factor" v={fmt(d.power_quality.power_factor, 3)} tone={pfTone(d.power_quality.power_factor)} s={pfLabel(d.power_quality.power_factor)} />
              <Pq l="Voltage" v={fmt(d.power_quality.voltage_kv, 1)} unit="kV" tone="success" s="Normal" />
              <Pq l="Frequency" v={fmt(d.power_quality.frequency, 2)} unit="Hz" tone="success" s="Normal" />
              <Pq l="THD (V)" v={fmt(d.power_quality.thd_v, 2)} unit="%" tone={qualTone(d.power_quality.thd_v, 5, 8)} s={qual(d.power_quality.thd_v, 5, 8)} />
              <Pq l="THD (I)" v={fmt(d.power_quality.thd_i, 2)} unit="%" tone={qualTone(d.power_quality.thd_i, 8, 15)} s={qual(d.power_quality.thd_i, 8, 15)} />
              <Pq l="Unbalance" v={fmt(d.power_quality.unbalance_pct, 2)} unit="%" tone={qualTone(d.power_quality.unbalance_pct, 5, 10)} s={qual(d.power_quality.unbalance_pct, 5, 10)} />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ---------- charts ---------- */
function buildDemand(d: Executive, mode: "light" | "dark"): EChartsOption {
  const pal = palette(mode);
  const ax = axisColors(mode);
  const isRange = !!d.is_range;
  const unit = isRange ? "MWh" : "MW";
  const curLabel = isRange ? "This period" : "Today";
  const prevLabel = isRange ? "Previous period" : "Yesterday";
  return {
    grid: { left: 8, right: 12, top: 24, bottom: 4, containLabel: true },
    legend: { data: [curLabel, prevLabel], right: 0, top: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: ax.text, fontSize: 11 } },
    tooltip: { trigger: "axis", valueFormatter: (v) => (v == null ? "—" : `${Number(v).toFixed(1)} ${unit}`) },
    xAxis: { type: "category", data: d.demand_trend.map((x) => x.hour), boundaryGap: false,
      axisLabel: { color: ax.text, fontSize: 10, interval: isRange ? 0 : 3, rotate: isRange ? 30 : 0 },
      axisLine: { lineStyle: { color: ax.grid } }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { color: ax.text, fontSize: 10 }, splitLine: { lineStyle: { color: ax.grid, opacity: 0.5 } } },
    series: [
      { name: prevLabel, type: "line", data: d.demand_trend.map((x) => x.yesterday_mw), smooth: true,
        showSymbol: isRange, lineStyle: { color: ax.text, width: 1.5, type: "dashed" } },
      { name: curLabel, type: "line", data: d.demand_trend.map((x) => x.today_mw), smooth: true,
        showSymbol: isRange, lineStyle: { color: pal[0], width: 2.4 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: pal[0] + "66" }, { offset: 1, color: pal[0] + "00" }] } },
        ...(isRange ? {} : { markLine: { silent: true, symbol: "none", data: [{ yAxis: 56 }],
          lineStyle: { color: "#EF4444", type: "dashed" },
          label: { formatter: "Contract 56 MVA", color: "#EF4444", fontSize: 10, position: "insideEndTop" } } }) },
    ],
  };
}

function buildTod(d: Executive, mode: "light" | "dark"): EChartsOption {
  const ax = axisColors(mode);
  const data = [
    { name: "Solar (08–16)", value: round(d.tod_breakup.solar_mwh), itemStyle: { color: "#F59E0B" } },
    { name: "Normal", value: round(d.tod_breakup.normal_mwh), itemStyle: { color: "#10B981" } },
    { name: "Peak (18–24)", value: round(d.tod_breakup.peak_mwh), itemStyle: { color: "#EF4444" } },
  ];
  return {
    tooltip: { trigger: "item", valueFormatter: (v) => `${Number(v).toFixed(1)} MWh` },
    legend: { bottom: 0, icon: "circle", textStyle: { color: ax.text, fontSize: 11 } },
    series: [{
      type: "pie", radius: ["52%", "76%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      itemStyle: { borderColor: mode === "dark" ? "#121829" : "#fff", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false }, data,
    }],
  };
}

function buildFeeders(d: Executive, mode: "light" | "dark"): EChartsOption {
  const pal = palette(mode);
  const ax = axisColors(mode);
  const rows = [...d.top_feeders].sort((a, b) => a.avg_mw - b.avg_mw);
  return {
    grid: { left: 8, right: 40, top: 6, bottom: 6, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => `${Number(v).toFixed(2)} MW` },
    xAxis: { type: "value", axisLabel: { color: ax.text, fontSize: 10 }, splitLine: { lineStyle: { color: ax.grid, opacity: 0.5 } } },
    yAxis: { type: "category", data: rows.map((r) => r.name), axisLabel: { color: ax.text, fontSize: 10.5 }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{
      type: "bar", barMaxWidth: 16, itemStyle: { borderRadius: [0, 5, 5, 0] as [number, number, number, number], color: pal[0] },
      data: rows.map((r, i) => ({ value: Number(r.avg_mw.toFixed(2)), itemStyle: { color: i === rows.length - 1 ? pal[0] : pal[5] } })),
      label: { show: true, position: "right", fontSize: 10, color: ax.text, formatter: (p: { value: number }) => p.value.toFixed(2) },
    }],
  } as EChartsOption;
}

/* ---------- small components ---------- */
function Pq({ l, v, unit, s, tone }: { l: string; v: string; unit?: string; s: string; tone: Tone }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-[11px] text-muted-foreground">{l}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">
        {v}{unit && <span className="text-xs font-semibold text-muted-foreground"> {unit}</span>}
      </div>
      <StatusChip tone={tone} className="mt-1">{s}</StatusChip>
    </div>
  );
}

/* ---------- helpers ---------- */
function round(v: number) { return Math.round(v * 10) / 10; }
function fmt(v: number | null | undefined, dp: number) { return v == null ? "—" : v.toFixed(dp); }
function pfLabel(pf: number | null) { return pf == null ? "—" : pf >= 0.99 ? "Excellent" : pf >= 0.95 ? "Good" : "Low"; }
function pfTone(pf: number | null): Tone { return pf != null && pf >= 0.95 ? "success" : "warning"; }
function qual(v: number | null, warn: number, bad: number) { return v == null ? "—" : v < warn ? "Good" : v < bad ? "Elevated" : "High"; }
function qualTone(v: number | null, warn: number, _bad: number): Tone { return v != null && v < warn ? "success" : "warning"; }

function timeOfDayGreeting(iso: string | null) {
  if (!iso) return "Welcome";
  const h = new Date(iso).getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight, Building2, CalendarRange, ChevronDown, Database, Gauge, History, IndianRupee,
  Layers, RotateCcw, Send, Settings, TriangleAlert,
} from "lucide-react";
import {
  api, type SapConfig, type SapHistoryDay, type SapPreview, type SapPreviewRange, type SapRow,
} from "../api";
import type { ViewKey } from "../components/AppShell";
import { KPICard, Card, CardHead, CardBody, StatusChip, LoadingState } from "../components/premium";
import type { Tone } from "../design-system/status";
import { useScope } from "../stores/scope";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const fmtShort = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const rate3 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : v.toFixed(3));
const inr = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type DayDetail = { pv: SapPreview; rows: SapRow[] };

export default function SapPosting({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { range, user, setRange } = useScope();
  const single = range.start === range.end;
  const postDate = range.start;   // the day being posted (single-day flow)

  // a day can only be posted once it has fully completed (data for the whole day is in).
  const todayIso = new Date().toLocaleDateString("en-CA");   // yyyy-mm-dd, local (IST)
  const lastComplete = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const postEnd = single ? range.start : range.end;
  const postable = postEnd < todayIso;

  const [rate, setRate] = useState<number | null>(null);
  const [rateSource, setRateSource] = useState("computed");
  const [pv, setPv] = useState<SapPreview | null>(null);      // selected-date detail (the posting target)
  const [rows, setRows] = useState<SapRow[]>([]);
  const [rangePv, setRangePv] = useState<SapPreviewRange | null>(null);
  const [cfg, setCfg] = useState<SapConfig | null>(null);
  const [hist, setHist] = useState<SapHistoryDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [force, setForce] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // inline expansion (history rows + per-day range rows). Detail is fetched on demand
  // and cached; expanding a row shows its cost-center breakdown *below that row*.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, DayDetail>>({});

  const loadHist = useCallback(() => { api.sapHistory(30).then(setHist).catch(() => {}); }, []);

  const loadSelected = useCallback(async (day: string, overrideRate: number | null | undefined) => {
    const p = await api.sapPreview(day, overrideRate ?? undefined);
    setPv(p); setRateSource(p.rate_source ?? "computed"); setRate(p.unit_rate);
    setRows(await api.sapStatus(day));
  }, []);

  // reload whenever the header range changes. History expansion resets + its cache is
  // cleared so a new posting date starts clean.
  useEffect(() => {
    setErr(null); setExpanded(null); setDetail({});
    api.sapConfig().then(setCfg).catch(() => {});
    loadHist();
    setBusy(true);
    const jobs: Promise<unknown>[] = [loadSelected(range.start, null)];
    if (!single) jobs.push(api.sapPreviewRange(range.start, range.end).then(setRangePv));
    else setRangePv(null);
    Promise.all(jobs).catch((e) => setErr(String(e))).finally(() => { setBusy(false); setInitialLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const overrideRate = () => (rateSource === "manual" ? rate ?? undefined : undefined);

  // expand/collapse an inline day (history or range row); fetch + cache on first open.
  const toggle = useCallback(async (day: string) => {
    setExpanded((cur) => (cur === day ? null : day));
    if (!detail[day]) {
      try {
        const [p, s] = await Promise.all([api.sapPreview(day, overrideRate()), api.sapStatus(day)]);
        setDetail((d) => ({ ...d, [day]: { pv: p, rows: s } }));
      } catch { /* leave uncached; row shows a retry hint */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function reprice(r: number | null) {
    await loadSelected(postDate, r);
    setDetail({});   // cached day details were priced at the old rate
    if (!single) setRangePv(await api.sapPreviewRange(range.start, range.end, r ?? undefined));
  }

  async function stage() {
    setBusy(true);
    try {
      const staged = single
        ? (await api.sapStage(range.start, overrideRate())).staged
        : (await api.sapStageRange(range.start, range.end, overrideRate())).staged;
      await loadSelected(postDate, overrideRate()); loadHist(); setDetail({});
      if (!single) setRangePv(await api.sapPreviewRange(range.start, range.end, overrideRate()));
      toast.success(`Staged ${staged} posting(s)`, { description: single ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)}` });
    } catch (e) { toast.error("Staging failed", { description: String(e) }); } finally { setBusy(false); }
  }

  async function post() {
    setBusy(true);
    try {
      const r = single ? await api.sapPost(range.start, user, force) : await api.sapPostRange(range.start, range.end, user, force);
      await loadSelected(postDate, overrideRate()); loadHist(); setDetail({});
      if (r.ok && r.posted) toast.success(`Posted ${r.posted} document(s) to SAP`, { description: r.skipped ? `${r.skipped} already-posted row(s) skipped.` : undefined });
      else if (r.ok) toast.info(r.reason ?? "Nothing to post", { description: "Enable “Re-post” to overwrite rows already posted." });
      else toast.warning("Not posted to SAP", { description: r.reason ?? "SAP credentials not configured — rows kept staged." });
    } catch (e) { toast.error("Post failed", { description: String(e) }); } finally { setBusy(false); }
  }

  const staged = rows.filter((r) => r.status !== "preview").length;

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>SAP Posting</h1>
          <div className="sub">
            Daily per-cost-center energy cost → posted to SAP (<span className="mono">ZPM_POWER_CONSUMPTION_SRV</span>),
            one document per day. The posting date follows the header date picker.
          </div>
        </div>
        <div className="head-controls">
          <StatusChip tone="info" dot>
            <CalendarRange size={12} className="mr-1 inline" />
            Posting: {single ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)} · ${rangePv?.days.length ?? "…"} days`}
          </StatusChip>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {initialLoading ? <LoadingState label="Loading SAP postings…" /> : (
      <>
      {cfg && !cfg.configured && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <TriangleAlert size={18} className="shrink-0 text-amber-500" />
          <div className="flex-1"><b>SAP credentials not configured.</b> You can preview and stage, but posting won't transmit until credentials are set.</div>
          <button className="btn small" onClick={() => onNavigate("settings")}><Settings size={13} /> Configure</button>
        </div>
      )}
      {cfg?.configured && cfg.costcenters.length > 0 && (
        <div className="text-xs text-muted-foreground">Posting {cfg.costcenters.length} selected cost center(s) — change in System Settings.</div>
      )}

      {/* ============ STEP 1: review the posting for the selected date ============ */}
      <Card>
        <CardHead
          title={single ? `Step 1 · Review — ${fmtDate(postDate)}` : `Step 1 · Review — ${rangePv?.days.length ?? ""} days`}
          icon={<Database size={16} />}
          right={<StatusChip tone={rateSource === "manual" ? "warning" : "info"}>
            {rateSource === "manual" ? "manual rate" : rateSource === "computed" ? "computed tariff" : "default rate"}
          </StatusChip>} />
        <CardBody className="space-y-4">
          {/* KPIs for the selected date/range */}
          {single && pv && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPICard label="Cost Centers" tone="info" icon={<Building2 size={17} />} value={pv.rows.length} footnote={<span>{staged} staged</span>} />
              <KPICard label="Day Consumption" tone="info" icon={<Gauge size={17} />} value={pv.total_consumption / 1000} unit="MWh" decimals={1} />
              <KPICard label="Day Amount" tone="warning" icon={<IndianRupee size={17} />} value={pv.total_amount / 1e5} unit="L" prefix="₹ " decimals={2} />
              <KPICard label="Unit Rate" tone="success" icon={<IndianRupee size={17} />} value={pv.unit_rate} unit="/kWh" prefix="₹ " decimals={3} footnote={<span>{rateSource}</span>} />
            </div>
          )}
          {!single && rangePv && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPICard label="Days" tone="info" icon={<CalendarRange size={17} />} value={rangePv.days.length} footnote={<span>one posting each</span>} />
              <KPICard label="Total Consumption" tone="info" icon={<Gauge size={17} />} value={rangePv.total_kwh / 1000} unit="MWh" decimals={1} />
              <KPICard label="Total Amount" tone="warning" icon={<IndianRupee size={17} />} value={rangePv.total_amount / 1e5} unit="L" prefix="₹ " decimals={2} />
              <KPICard label="Unit Rate" tone="success" icon={<IndianRupee size={17} />} value={rangePv.unit_rate} unit="/kWh" prefix="₹ " decimals={3} footnote={<span>{rateSource}</span>} />
            </div>
          )}

          {/* rate control */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">Unit Rate (₹/kWh){!single && " · applies to every day"}</span>
            <div className="flex items-center rounded-lg border bg-background px-2.5 py-1">
              <span className="mr-1 text-muted-foreground">₹</span>
              <input type="number" step="0.01" className="w-20 bg-transparent font-bold tabular-nums outline-none"
                value={rate ?? ""} onChange={(e) => { setRate(e.target.value === "" ? null : +e.target.value); setRateSource("manual"); }} />
            </div>
            <button className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              disabled={busy} onClick={() => { setRateSource("computed"); reprice(null); }}>
              <RotateCcw size={13} /> Reset to computed
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              disabled={busy || rate == null} onClick={() => reprice(rate)}>
              <Gauge size={13} /> Apply
            </button>
          </div>

          {/* single-day cost-center table */}
          {single && pv && <CostCenterTable pv={pv} rows={rows} />}

          {/* range: per-day breakdown, each expandable inline */}
          {!single && rangePv && (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 px-3 py-2"></th>
                    <th className="py-2 text-left font-medium">Date</th>
                    <th className="py-2 text-right font-medium">Cost Centers</th>
                    <th className="py-2 text-right font-medium">kWh</th>
                    <th className="py-2 text-right font-medium">Rate</th>
                    <th className="px-4 py-2 text-right font-medium">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {rangePv.days.map((d) => (
                    <ExpandableRows key={d.posting_date} day={d.posting_date} open={expanded === d.posting_date}
                      onToggle={() => toggle(d.posting_date)} detail={detail[d.posting_date]} cols={6}>
                      <td className="px-3 py-2"><Chevron open={expanded === d.posting_date} /></td>
                      <td className="py-2 font-medium">{fmtDate(d.posting_date)}</td>
                      <td className="py-2 text-right tabular-nums">{d.rows_ct}</td>
                      <td className="py-2 text-right tabular-nums">{inr(d.total_kwh)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{d.unit_rate.toFixed(3)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{inr(d.total_amount)}</td>
                    </ExpandableRows>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>

        {/* ============ STEP 2: stage + post ============ */}
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step 2 · Post</span>
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            title="Re-send rows already posted (SAP overwrites by posting-date + cost-center)">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Re-post
          </label>
          <button className="btn" disabled={busy || !postable} onClick={stage}
            title={postable ? "" : "Available once the day has completed"}>
            <Layers size={14} /> Stage {single && pv ? `(${pv.rows.length})` : ""}
          </button>
          <button className="btn primary" disabled={busy || !postable} onClick={post}
            title={postable ? "" : "Available once the day has completed"}>
            <Send size={14} /> Post to SAP
          </button>
        </div>
        {!postable && (
          <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-foreground">
            <TriangleAlert size={15} className="shrink-0 text-amber-500" />
            <span>{single
              ? <>This day hasn’t completed yet — a day can only be posted once it has fully ended. Pick <b>{fmtDate(lastComplete)}</b> or earlier.</>
              : <>The selected range includes days that haven’t completed yet. End the range on <b>{fmtDate(lastComplete)}</b> or earlier.</>}</span>
          </div>
        )}
      </Card>

      {/* ============ Posting history (browse-only, expands inline) ============ */}
      <Card>
        <CardHead title="Posting History" icon={<History size={16} />}
          right={<span className="text-xs text-muted-foreground">click a row to see its cost centers below · <ArrowUpRight size={11} className="inline" /> to load that day above · last {hist.length} day(s)</span>} />
        <CardBody className="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-3 pb-2"></th>
                <th className="pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Rows</th>
                <th className="pb-2 text-right font-medium">Amount (₹)</th>
                <th className="pb-2 text-right font-medium">₹/kWh</th>
                <th className="pb-2 text-center font-medium">Status</th>
                <th className="pb-2 text-left font-medium">Posted by</th>
                <th className="px-5 pb-2 text-right font-medium">Posted at</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => {
                const day = h.posting_date.slice(0, 10);
                return (
                  <ExpandableRows key={day} day={day} open={expanded === day} onToggle={() => toggle(day)}
                    detail={detail[day]} cols={8}>
                    <td className="px-3 py-2"><Chevron open={expanded === day} /></td>
                    <td className="py-2 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {fmtShort(day)} {new Date(day).getFullYear()}
                        <button title="Load this day into Step 1 for posting"
                          className="text-muted-foreground transition-colors hover:text-primary"
                          onClick={(e) => { e.stopPropagation(); setRange({ start: day, end: day, preset: "Custom" }); }}>
                          <ArrowUpRight size={14} />
                        </button>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{h.rows_ct}</td>
                    <td className="py-2 text-right tabular-nums">{inr(h.total_amount)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{rate3(h.total_kwh ? Number(h.total_amount ?? 0) / Number(h.total_kwh) : null)}</td>
                    <td className="py-2 text-center"><HistStatus h={h} /></td>
                    <td className="py-2">{h.posted_by ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-5 py-2 text-right text-xs text-muted-foreground">
                      {h.last_posted ? new Date(h.last_posted).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </ExpandableRows>
                );
              })}
              {hist.length === 0 && <tr><td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">No postings yet.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="text-xs text-muted-foreground">
        OData payload {"{Postingdate, Costcenter, Costcentredesc, Dayunitconsunption, Dayunitrate, Dayamount}"}.
        Real submission runs only when SAP credentials are configured; otherwise rows stay staged (pending).
      </div>
      </>
      )}
    </div>
  );
}

/* A clickable summary row plus, when open, a detail row rendered *directly below it*
   that holds the day's cost-center breakdown (or a loading placeholder). */
function ExpandableRows({ day, open, onToggle, detail, cols, children }: {
  day: string; open: boolean; onToggle: () => void; detail?: DayDetail; cols: number; children: React.ReactNode;
}) {
  return (
    <>
      <tr className={`group cursor-pointer border-b border-border/40 hover:bg-accent/40 ${open ? "bg-primary/5" : ""}`}
        onClick={onToggle} title="Click to expand this day">
        {children}
      </tr>
      {open && (
        <tr className="border-b border-border/40 bg-muted/20">
          <td colSpan={cols} className="px-3 py-3">
            {detail
              ? <div className="rounded-lg border bg-background"><CostCenterTable pv={detail.pv} rows={detail.rows} compact /></div>
              : <div className="py-4 text-center text-xs text-muted-foreground">Loading {fmtDate(day)}…</div>}
          </td>
        </tr>
      )}
    </>
  );
}

/* The per-cost-center table — shared by the single-day view and every inline expansion,
   so the breakdown looks identical everywhere. Shows a totals footer for clarity. */
function CostCenterTable({ pv, rows, compact }: { pv: SapPreview; rows: SapRow[]; compact?: boolean }) {
  const statusBy = Object.fromEntries(rows.map((r) => [r.sap_costcenter, r.status]));
  if (pv.rows.length === 0)
    return <div className="px-4 py-6 text-center text-sm text-muted-foreground">No cost-center consumption for this day.</div>;
  return (
    <div className={compact ? "" : "overflow-hidden rounded-xl border"}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Cost Center</th>
            <th className="py-2 text-left font-medium">Description</th>
            <th className="py-2 text-right font-medium">kWh</th>
            <th className="py-2 text-right font-medium">Rate</th>
            <th className="py-2 text-right font-medium">Amount (₹)</th>
            <th className="px-4 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {pv.rows.map((r) => (
            <tr key={r.sap_costcenter} className="border-b border-border/40 last:border-0">
              <td className="px-4 py-2 font-mono text-xs">{r.sap_costcenter}</td>
              <td className="py-2">{r.costcenter_desc}</td>
              <td className="py-2 text-right tabular-nums">{r.consumption.toLocaleString("en-IN")}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.unit_rate?.toFixed(3)}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{inr(r.amount)}</td>
              <td className="px-4 py-2 text-right"><StatusPill s={statusBy[r.sap_costcenter] ?? "preview"} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="px-4 py-2" colSpan={2}>Total · {pv.rows.length} cost centers</td>
            <td className="py-2 text-right tabular-nums">{inr(pv.total_consumption)}</td>
            <td className="py-2"></td>
            <td className="py-2 text-right tabular-nums">{inr(pv.total_amount)}</td>
            <td className="px-4 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />;
}

function HistStatus({ h }: { h: SapHistoryDay }) {
  if (h.posted) return <StatusChip tone="success" dot>posted {h.posted}</StatusChip>;
  if (h.failed) return <StatusChip tone="danger" dot>failed {h.failed}</StatusChip>;
  if (h.pending) return <StatusChip tone="warning" dot>pending {h.pending}</StatusChip>;
  return <StatusChip tone="neutral">—</StatusChip>;
}

function StatusPill({ s }: { s: string }) {
  const tone: Tone = s === "posted" || s === "confirmed" ? "success"
    : s === "failed" ? "danger" : s === "pending" ? "warning" : "neutral";
  return <StatusChip tone={tone} dot>{s}</StatusChip>;
}

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight, Building2, CalendarRange, Database, Gauge, History, IndianRupee, Layers,
  RotateCcw, Send, Settings, TriangleAlert,
} from "lucide-react";
import {
  api, type SapConfig, type SapHistoryDay, type SapPreview, type SapPreviewRange, type SapRow,
} from "../api";
import type { ViewKey } from "../components/AppShell";
import { KPICard, Card, CardHead, CardBody, StatusChip, LoadingState } from "../components/premium";
import type { Tone } from "../design-system/status";
import { useScope } from "../stores/scope";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const rate3 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : v.toFixed(3));

export default function SapPosting({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { range, user, setRange } = useScope();
  const single = range.start === range.end;

  // a day can only be posted once it has fully completed (data for the whole day
  // is in). "today" and future days are still accumulating, so posting is blocked.
  const todayIso = new Date().toLocaleDateString("en-CA");   // yyyy-mm-dd, local (IST)
  const lastComplete = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const postEnd = single ? range.start : range.end;          // latest day in scope
  const postable = postEnd < todayIso;                       // whole scope has completed

  const [rate, setRate] = useState<number | null>(null);
  const [rateSource, setRateSource] = useState("computed");
  const [pv, setPv] = useState<SapPreview | null>(null);      // focus-day detail
  const [rows, setRows] = useState<SapRow[]>([]);
  const [rangePv, setRangePv] = useState<SapPreviewRange | null>(null);
  const [focusDate, setFocusDate] = useState(range.end);
  const [cfg, setCfg] = useState<SapConfig | null>(null);
  const [hist, setHist] = useState<SapHistoryDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [force, setForce] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadHist = useCallback(() => { api.sapHistory(30).then(setHist).catch(() => {}); }, []);

  const loadDetail = useCallback(async (day: string, overrideRate: number | null | undefined) => {
    const p = await api.sapPreview(day, overrideRate ?? undefined);
    setPv(p); setRateSource(p.rate_source ?? "computed"); setRate(p.unit_rate);
    setRows(await api.sapStatus(day));
  }, []);

  // reload whenever the header range changes
  useEffect(() => {
    setErr(null);
    setFocusDate(range.end);
    api.sapConfig().then(setCfg).catch(() => {});
    loadHist();
    setBusy(true);
    const jobs: Promise<unknown>[] = [loadDetail(range.end, null)];
    if (!single) jobs.push(api.sapPreviewRange(range.start, range.end).then(setRangePv));
    else setRangePv(null);
    Promise.all(jobs).catch((e) => setErr(String(e))).finally(() => { setBusy(false); setInitialLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  const overrideRate = () => (rateSource === "manual" ? rate ?? undefined : undefined);

  async function reprice(r: number | null) {
    // apply a manual rate (or reset to computed) across the focus day + range summary
    await loadDetail(focusDate, r);
    if (!single) setRangePv(await api.sapPreviewRange(range.start, range.end, r ?? undefined));
  }

  async function stage() {
    setBusy(true);
    try {
      const staged = single
        ? (await api.sapStage(range.start, overrideRate())).staged
        : (await api.sapStageRange(range.start, range.end, overrideRate())).staged;
      await loadDetail(focusDate, overrideRate()); loadHist();
      if (!single) setRangePv(await api.sapPreviewRange(range.start, range.end, overrideRate()));
      toast.success(`Staged ${staged} posting(s)`, { description: single ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)}` });
    } catch (e) { toast.error("Staging failed", { description: String(e) }); } finally { setBusy(false); }
  }

  async function post() {
    setBusy(true);
    try {
      const r = single ? await api.sapPost(range.start, user, force) : await api.sapPostRange(range.start, range.end, user, force);
      await loadDetail(focusDate, overrideRate()); loadHist();
      if (r.ok && r.posted) toast.success(`Posted ${r.posted} document(s) to SAP`, { description: r.skipped ? `${r.skipped} already-posted row(s) skipped.` : undefined });
      else if (r.ok) toast.info(r.reason ?? "Nothing to post", { description: "Enable “Re-post” to overwrite rows already posted." });
      else toast.warning("Not posted to SAP", { description: r.reason ?? "SAP credentials not configured — rows kept staged." });
    } catch (e) { toast.error("Post failed", { description: String(e) }); } finally { setBusy(false); }
  }

  const statusBy = Object.fromEntries(rows.map((r) => [r.sap_costcenter, r.status]));
  const staged = rows.filter((r) => r.status !== "preview").length;

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>SAP Posting</h1>
          <div className="sub">
            Daily per-cost-center energy cost → posted to SAP (<span className="mono">ZPM_POWER_CONSUMPTION_SRV</span>),
            one document per day. Rate defaults to the computed tariff; the period follows the header date picker.
          </div>
        </div>
        <div className="head-controls">
          <StatusChip tone="info" dot>
            <CalendarRange size={12} className="mr-1 inline" />
            {single ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)} · ${rangePv?.days.length ?? "…"} days`}
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

      {/* rate + actions */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-x-6 gap-y-3 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Unit Rate (₹/kWh){!single && <span className="text-[11px]">· applies to all days</span>}
              <StatusChip tone={rateSource === "manual" ? "warning" : "info"}>
                {rateSource === "manual" ? "manual override" : rateSource === "computed" ? "computed tariff" : "default"}
              </StatusChip>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border px-3 py-1.5">
                <span className="mr-1 text-muted-foreground">₹</span>
                <input type="number" step="0.01" className="w-24 bg-transparent text-lg font-bold tabular-nums outline-none"
                  value={rate ?? ""} onChange={(e) => { setRate(e.target.value === "" ? null : +e.target.value); setRateSource("manual"); }} />
              </div>
              <button className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent"
                disabled={busy} onClick={() => { setRateSource("computed"); reprice(null); }}>
                <RotateCcw size={13} /> Reset to computed
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent"
                disabled={busy || rate == null} onClick={() => reprice(rate)}>
                <Gauge size={13} /> Apply &amp; preview
              </button>
            </div>
          </div>
          <div className="ml-auto flex items-end gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-xs text-muted-foreground"
              title="Re-send rows already posted (SAP overwrites by posting-date + cost-center)">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Re-post
            </label>
            <button className="btn" disabled={busy || !postable} onClick={stage}
              title={postable ? "" : "Available once the day has completed"}><Layers size={14} /> Stage {single && pv ? `(${pv.rows.length})` : ""}</button>
            <button className="btn primary" disabled={busy || !postable} onClick={post}
              title={postable ? "" : "Available once the day has completed"}><Send size={14} /> Post to SAP</button>
          </div>
        </CardBody>
        {!postable && (
          <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-foreground">
            <TriangleAlert size={15} className="shrink-0 text-amber-500" />
            <span>{single
              ? <>This day hasn’t completed yet — a day can only be posted once it has fully ended. Pick <b>{fmtDate(lastComplete)}</b> or earlier to post.</>
              : <>The selected range includes days that haven’t completed yet. Choose a range ending <b>{fmtDate(lastComplete)}</b> or earlier to post.</>}</span>
          </div>
        )}
      </Card>

      {/* KPIs */}
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
          <KPICard label="Cost Centers/Day" tone="success" icon={<Building2 size={17} />} value={rangePv.days[0]?.rows_ct ?? 0} footnote={<span>{rateSource} rate</span>} />
        </div>
      )}

      {/* range: per-day summary */}
      {!single && rangePv && (
        <Card>
          <CardHead title="Per-Day Breakdown" icon={<CalendarRange size={16} />}
            right={<span className="text-xs text-muted-foreground">click a day for its cost-center detail</span>} />
          <CardBody className="px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Cost Centers</th>
                  <th className="pb-2 text-right font-medium">kWh</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="px-5 pb-2 text-right font-medium">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rangePv.days.map((d) => (
                  <tr key={d.posting_date}
                    className={`cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40 ${d.posting_date === focusDate ? "bg-primary/5" : ""}`}
                    onClick={() => { setFocusDate(d.posting_date); loadDetail(d.posting_date, overrideRate()); }}>
                    <td className="px-5 py-2 font-medium">{fmtDate(d.posting_date)}</td>
                    <td className="py-2 text-right tabular-nums">{d.rows_ct}</td>
                    <td className="py-2 text-right tabular-nums">{d.total_kwh.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{d.unit_rate.toFixed(3)}</td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums">{d.total_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* focus-day cost-center detail */}
      {pv && (
        <Card>
          <CardHead title="Cost-Center Postings" icon={<Database size={16} />}
            right={<StatusChip tone="info" dot><CalendarRange size={12} className="mr-1 inline" />{fmtDate(focusDate)}</StatusChip>} />
          <CardBody className="px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 pb-2 text-left font-medium">Cost Center</th>
                  <th className="pb-2 text-left font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">kWh</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Amount (₹)</th>
                  <th className="px-5 pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pv.rows.map((r) => (
                  <tr key={r.sap_costcenter} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2 font-mono text-xs">{r.sap_costcenter}</td>
                    <td className="py-2">{r.costcenter_desc}</td>
                    <td className="py-2 text-right tabular-nums">{r.consumption.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.unit_rate?.toFixed(3)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{r.amount?.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-2 text-right"><StatusPill s={statusBy[r.sap_costcenter] ?? "preview"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* posting history */}
      <Card>
        <CardHead title="Posting History" icon={<History size={16} />}
          right={<span className="text-xs text-muted-foreground">click a row to preview · <ArrowUpRight size={11} className="inline" /> to open the day · last {hist.length} day(s)</span>} />
        <CardBody className="px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 pb-2 text-left font-medium">Date</th>
                <th className="pb-2 text-right font-medium">Rows</th>
                <th className="pb-2 text-right font-medium">Amount (₹)</th>
                <th className="pb-2 text-right font-medium">Rate ₹/kWh</th>
                <th className="pb-2 text-center font-medium">Posted</th>
                <th className="pb-2 text-center font-medium">Pending</th>
                <th className="pb-2 text-center font-medium">Failed</th>
                <th className="pb-2 text-left font-medium">Posted by</th>
                <th className="px-5 pb-2 text-right font-medium">Posted at</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.posting_date} className={`group cursor-pointer border-b border-border/40 last:border-0 hover:bg-accent/40 ${h.posting_date.slice(0, 10) === focusDate ? "bg-primary/5" : ""}`}
                  title="Click to preview this day"
                  onClick={() => { const d = h.posting_date.slice(0, 10); setFocusDate(d); loadDetail(d, overrideRate()); }}>
                  <td className="px-5 py-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {fmtDate(h.posting_date.slice(0, 10))}
                      <button title="Open this day for posting (sets the header date)"
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); const d = h.posting_date.slice(0, 10); setRange({ start: d, end: d, preset: "Custom" }); }}>
                        <ArrowUpRight size={14} />
                      </button>
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{h.rows_ct}</td>
                  <td className="py-2 text-right tabular-nums">{Number(h.total_amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{rate3(h.total_kwh ? Number(h.total_amount ?? 0) / Number(h.total_kwh) : null)}</td>
                  <td className="py-2 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{h.posted || "—"}</td>
                  <td className="py-2 text-center tabular-nums text-amber-600 dark:text-amber-400">{h.pending || "—"}</td>
                  <td className="py-2 text-center tabular-nums text-red-600 dark:text-red-400">{h.failed || "—"}</td>
                  <td className="py-2">{h.posted_by ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-2 text-right text-xs text-muted-foreground">
                    {h.last_posted ? new Date(h.last_posted).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                </tr>
              ))}
              {hist.length === 0 && <tr><td colSpan={9} className="px-5 py-6 text-center text-muted-foreground">No postings yet.</td></tr>}
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

function StatusPill({ s }: { s: string }) {
  const tone: Tone = s === "posted" || s === "confirmed" ? "success"
    : s === "failed" ? "danger" : s === "pending" ? "warning" : "neutral";
  return <StatusChip tone={tone} dot>{s}</StatusChip>;
}

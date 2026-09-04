import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock, CheckCircle2, ChevronDown, Cpu, Database, Gauge, History, KeyRound, Layers,
  Lock, Plus, PlugZap, Save, Server, ShieldCheck, SlidersHorizontal, Trash2, XCircle,
} from "lucide-react";
import { api, type AuditRow, type ConstantRow, type MeterFactors, type Meter, type SapConfig, type SapCostCenter, type SystemConfigRow, type TariffRow } from "../api";
import type { ViewKey } from "../components/AppShell";
import { Card, CardHead, CardBody, StatusChip, LoadingState } from "../components/premium";
import { cn } from "../lib/utils";

const inp = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const lbl = "mb-1 block text-xs font-medium text-muted-foreground";
const todayIso = () => new Date().toISOString().slice(0, 10);
// Start of the current Indian financial year (01 Apr). New baselines default here.
const fyStartIso = () => { const n = new Date(); const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; return `${y}-04-01`; };
const fmtDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const trimZeros = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
const fmtNum = (v: number) => trimZeros(v.toLocaleString("en-IN", { maximumFractionDigits: 6 }));
const ACTOR = "Akash Yadav";   // stamped as the change author in the audit log

// Versions arrive newest-effective-first. The one in force *today* is the latest
// whose effective_from is on/before today; anything dated later is a future
// ("scheduled") version and must not be shown as the live value.
const isFuture = (effective_from: string) => effective_from.slice(0, 10) > todayIso();
function inForceIndex<T extends { effective_from: string }>(versions: T[]): number {
  const i = versions.findIndex((v) => v.effective_from.slice(0, 10) <= todayIso());
  return i === -1 ? versions.length - 1 : i;   // all future → earliest is next up
}
function VersionBadge({ effective_from, active }: { effective_from: string; active: boolean }) {
  if (isFuture(effective_from))
    return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">scheduled</span>;
  if (active)
    return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">in force</span>;
  return null;
}

type Tab = "sap" | "constants" | "system" | "log";

export default function SystemSettings({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [tab, setTab] = useState<Tab>("sap");

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>System Settings</h1>
          <div className="sub">SAP connectivity and the plant's tariff constants — all editable here, applied automatically across PEMS.</div>
        </div>
      </div>

      {/* tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        <TabBtn active={tab === "sap"} onClick={() => setTab("sap")} icon={<Server size={15} />}>SAP Connection</TabBtn>
        <TabBtn active={tab === "constants"} onClick={() => setTab("constants")} icon={<SlidersHorizontal size={15} />}>Constants &amp; Factors</TabBtn>
        <TabBtn active={tab === "system"} onClick={() => setTab("system")} icon={<Cpu size={15} />}>System Configuration</TabBtn>
        <TabBtn active={tab === "log"} onClick={() => setTab("log")} icon={<History size={15} />}>Change Log</TabBtn>
      </div>

      {tab === "sap" && <SapTab onNavigate={onNavigate} />}
      {tab === "constants" && <ConstantsTab />}
      {tab === "system" && <SystemTab />}
      {tab === "log" && <ChangeLogTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent")}>
      {icon}{children}
    </button>
  );
}

/* ============================ SAP tab ============================ */
function SapTab({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [cfg, setCfg] = useState<SapConfig | null>(null);
  const [ccs, setCcs] = useState<SapCostCenter[]>([]);
  const [user, setUser] = useState("");
  const [base, setBase] = useState("");
  const [service, setService] = useState("");
  const [client, setClient] = useState("");
  const [verifySsl, setVerifySsl] = useState(false);
  const [password, setPassword] = useState("");
  const [postAll, setPostAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    Promise.all([api.sapConfig(), api.sapCostcenters()]).then(([c, list]) => {
      setCfg(c); setCcs(list);
      setUser(c.user); setBase(c.odata_base); setService(c.odata_service); setClient(c.client);
      setVerifySsl(c.verify_ssl);
      setPostAll(c.costcenters.length === 0);
      setSelected(new Set(c.costcenters));
    }).catch((e) => toast.error("Failed to load settings", { description: String(e) }));
  }, []);

  const toggle = (cc: string) => setSelected((p) => {
    const s = new Set(p); s.has(cc) ? s.delete(cc) : s.add(cc); return s;
  });

  async function save() {
    setBusy(true);
    try {
      const body: Partial<SapConfig> & { password?: string } = {
        user, odata_base: base, odata_service: service, client, verify_ssl: verifySsl,
        costcenters: postAll ? [] : [...selected],
      };
      if (password) body.password = password;
      const updated = await api.sapSaveConfig(body);
      setCfg(updated); setPassword("");
      toast.success("SAP configuration saved", {
        description: updated.configured ? "Credentials complete — ready to test posting." : "Saved. Add a password to complete setup.",
      });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const body: Partial<SapConfig> & { password?: string } = { user, odata_base: base, odata_service: service, client, verify_ssl: verifySsl };
      if (password) body.password = password;
      const r = await api.sapTestConnection(body);
      setTestResult(r);
      if (r.ok) toast.success("SAP connection OK", { description: r.message });
      else toast.error("SAP connection failed", { description: r.message });
    } catch (e) { setTestResult({ ok: false, message: String(e) }); toast.error("Test failed", { description: String(e) }); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHead title="SAP Integration" icon={<Server size={16} />}
          right={cfg && <StatusChip tone={cfg.configured ? "success" : "warning"} dot>
            {cfg.configured ? "Configured" : "Incomplete"}
          </StatusChip>} />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={lbl}>OData Base URL</label>
              <input className={inp} value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://host:8000/sap/opu/odata/sap" />
            </div>
            <div>
              <label className={lbl}>OData Service</label>
              <input className={inp} value={service} onChange={(e) => setService(e.target.value)} placeholder="ZPM_POWER_CONSUMPTION_SRV" />
            </div>
            <div>
              <label className={lbl}>SAP Username</label>
              <input className={inp} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" placeholder="SAP user" />
            </div>
            <div>
              <label className={lbl}>SAP Client</label>
              <input className={inp} value={client} onChange={(e) => setClient(e.target.value)} inputMode="numeric" maxLength={3} placeholder="e.g. 100" />
              <div className="mt-1 text-[11px] text-muted-foreground">The logon client; sent as <span className="font-mono">sap-client</span> on the OData call.</div>
            </div>
            <div>
              <label className={lbl}><KeyRound size={11} className="mr-1 inline" />SAP Password</label>
              <input className={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                placeholder={cfg?.has_password ? "•••••••• (saved — type to change)" : "Enter SAP password"} />
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck size={11} /> Encrypted at rest (vault); never returned to the browser once saved.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <button className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50" disabled={testing} onClick={testConnection}>
              <PlugZap size={14} /> {testing ? "Testing…" : "Test connection"}
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="On-prem SAP usually uses a self-signed certificate">
              <input type="checkbox" checked={verifySsl} onChange={(e) => setVerifySsl(e.target.checked)} />
              Verify SSL certificate
            </label>
            {testResult && (
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {testResult.message}
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Cost Centers to Post" icon={<Layers size={16} />}
          right={<span className="text-xs text-muted-foreground">{postAll ? "All" : `${selected.size} selected`}</span>} />
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <button className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", postAll && "bg-primary/12 text-primary")} onClick={() => setPostAll(true)}>All cost centers</button>
            <button className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", !postAll && "bg-primary/12 text-primary")} onClick={() => setPostAll(false)}>Selected only</button>
          </div>
          {!postAll && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {ccs.map((c) => (
                <label key={c.sap_costcenter} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
                  <input type="checkbox" checked={selected.has(c.sap_costcenter)} onChange={() => toggle(c.sap_costcenter)} />
                  <span className="font-mono text-xs">{c.sap_costcenter}</span>
                  <span className="truncate text-muted-foreground">{c.description}</span>
                </label>
              ))}
            </div>
          )}
          {!postAll && (
            <div className="flex gap-2 text-xs">
              <button className="text-primary hover:underline" onClick={() => setSelected(new Set(ccs.map((c) => c.sap_costcenter)))}>Select all</button>
              <button className="text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <button className="btn primary" disabled={busy} onClick={save}><Save size={15} /> Save configuration</button>
        {cfg?.configured && <button className="btn" onClick={() => onNavigate("sap")}><Database size={15} /> Go to SAP Posting</button>}
        {cfg?.configured && <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> Ready to test posting</span>}
      </div>
    </div>
  );
}

/* ===================== Constants & Factors tab ===================== */
function ConstantsTab() {
  const [rows, setRows] = useState<ConstantRow[]>([]);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => Promise.all([api.constants(), api.tariffs()])
    .then(([c, t]) => { setRows(c); setTariffs(t); })
    .catch((e) => toast.error("Failed to load constants", { description: String(e) }))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // group versions by key, and keys by category (rows arrive sorted category, ckey, effective_from DESC)
  const categories = useMemo(() => {
    const byKey = new Map<string, ConstantRow[]>();
    for (const r of rows) { const a = byKey.get(r.ckey) ?? []; a.push(r); byKey.set(r.ckey, a); }
    const cats = new Map<string, string[]>();
    for (const [k, vs] of byKey) { const cat = vs[0].category; const a = cats.get(cat) ?? []; a.push(k); cats.set(cat, a); }
    return { byKey, cats };
  }, [rows]);

  if (loading) return <Card><CardBody><LoadingState /></CardBody></Card>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
        <b className="text-foreground">Date-effective by design.</b> Each value applies from its effective date forward. To change a factor,
        <b className="text-foreground"> schedule a new value</b> from a date — past bills stay reproducible with the value that was in force then.
      </div>

      {[...categories.cats.entries()].map(([cat, keys]) => (
        <div key={cat} className="space-y-3">
          <Card>
            <CardHead title={cat} icon={<Gauge size={16} />} right={<span className="text-xs text-muted-foreground">{keys.length} factor{keys.length > 1 ? "s" : ""}</span>} />
            <CardBody className="space-y-3">
              {keys.map((k) => <ConstantCard key={k} versions={categories.byKey.get(k)!} onChange={setRows} />)}
            </CardBody>
          </Card>
          {cat === "Metering" && <MeterFactorsCard />}
        </div>
      ))}

      <TariffCard tariffs={tariffs} onChange={setTariffs} />
    </div>
  );
}

/* ---- per-meter multiplication factor overrides (date-effective) ---- */
function MeterFactorsCard() {
  const [data, setData] = useState<MeterFactors | null>(null);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [pick, setPick] = useState("");     // "device|feeder"
  const [newVal, setNewVal] = useState("");
  const [newDate, setNewDate] = useState(fyStartIso());   // new baselines start at the FY start
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.meterFactors().then(setData).catch((e) => toast.error("Failed to load meter factors", { description: String(e) }));
    api.meters().then(setMeters).catch(() => {});
  }, []);

  const mkey = (d: string, f: number) => `${d}|${f}`;
  const overridden = new Set((data?.meters ?? []).map((m) => mkey(m.device_id, m.feeder_id)));
  const available = meters.filter((m) => !overridden.has(mkey(m.device_id, m.feeder_id)));

  async function add() {
    if (!pick) { toast.error("Choose a meter"); return; }
    if (newVal.trim() === "" || isNaN(Number(newVal))) { toast.error("Enter a numeric factor"); return; }
    const [d, f] = pick.split("|");
    setBusy(true);
    try {
      setData(await api.saveMeterFactor({ device_id: d, feeder_id: Number(f), mult_factor: Number(newVal), effective_from: newDate, updated_by: ACTOR }));
      setPick(""); setNewVal(""); setNewDate(fyStartIso());
      toast.success("Meter factor added", { description: `×${trimZeros(Number(newVal).toFixed(6))} from ${fmtDate(newDate)}` });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }

  if (!data) return null;
  return (
    <Card>
      <CardHead title="Per-Meter Multiplication Factors" icon={<Gauge size={16} />}
        right={<span className="text-xs text-muted-foreground">{data.meters.length} meter{data.meters.length !== 1 ? "s" : ""}</span>} />
      <CardBody className="space-y-3">
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
          The grossing factor is <b className="text-foreground">per meter</b> and <b className="text-foreground">date-effective</b> (e.g. Furnace-1 ×1.0097,
          Furnace-2 ×1.012). A meter listed here uses its own factor from its effective date; every other meter falls back to the
          global <b className="text-foreground">×{trimZeros(data.default.toFixed(6))}</b>.
        </div>

        {data.meters.map((m) => <MeterFactorRow key={mkey(m.device_id, m.feeder_id)} meter={m} onChange={setData} />)}

        {/* add a new meter override */}
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="min-w-[220px] flex-1">
            <label className={lbl}>Add a meter</label>
            <select className={inp} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select a meter…</option>
              {available.map((m) => (
                <option key={mkey(m.device_id, m.feeder_id)} value={mkey(m.device_id, m.feeder_id)}>
                  {m.feeder_name} — {m.device_id}/{m.feeder_id}
                </option>
              ))}
            </select>
          </div>
          <div><label className={lbl}>Factor</label><input className={`${inp} w-28`} value={newVal} onChange={(e) => setNewVal(e.target.value)} inputMode="decimal" placeholder="1.0097" /></div>
          <div><label className={lbl}>Effective from</label><input className={inp} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
          <button className="btn primary h-[38px]" disabled={busy || !pick} onClick={add}><Plus size={14} /> Add</button>
        </div>
      </CardBody>
    </Card>
  );
}

function MeterFactorRow({ meter, onChange }: { meter: MeterFactors["meters"][number]; onChange: (d: MeterFactors) => void }) {
  const idx = inForceIndex(meter.versions);   // version applying *today*
  const cur = meter.versions[idx];
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState(false);
  const [val, setVal] = useState(String(cur.mult_factor));
  const [date, setDate] = useState(cur.effective_from.slice(0, 10));   // edit the in-force version by default
  const [busy, setBusy] = useState(false);
  const dev = meter.device_id, fid = meter.feeder_id;

  async function schedule() {
    if (val.trim() === "" || isNaN(Number(val))) { toast.error("Enter a numeric factor"); return; }
    setBusy(true);
    try {
      onChange(await api.saveMeterFactor({ device_id: dev, feeder_id: fid, mult_factor: Number(val), effective_from: date, updated_by: ACTOR }));
      setOpen(false);
      toast.success(`${meter.feeder_name ?? dev} factor updated`, { description: `×${trimZeros(Number(val).toFixed(6))} from ${fmtDate(date)}` });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }
  async function removeVersion(effective_from: string) {
    try { onChange(await api.deleteMeterFactor(dev, fid, effective_from, ACTOR)); toast.success("Version removed"); }
    catch (e) { toast.error("Delete failed", { description: String(e) }); }
  }

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{meter.feeder_name ?? `${dev}/${fid}`}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{dev} · feeder {fid}{cur.note ? ` · ${cur.note}` : ""}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-primary">×{trimZeros(cur.mult_factor.toFixed(6))}</div>
            <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground"><CalendarClock size={10} /> since {fmtDate(cur.effective_from)}</div>
          </div>
          <button className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => { setVal(String(cur.mult_factor)); setDate(cur.effective_from.slice(0, 10)); setOpen((o) => !o); }}><Plus size={13} /> New value</button>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className={lbl}>New factor</label><input className={inp} value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" /></div>
          <div><label className={lbl}>Effective from</label><input className={inp} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <button className="btn primary h-[38px]" disabled={busy} onClick={schedule}><Save size={14} /> Save</button>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">Keep the date as-is to correct the current value; pick a <b>later</b> date to schedule a future change (it shows as “scheduled” until then).</p>
        </div>
      )}
      <div className="border-t px-3 py-1.5">
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setHist((h) => !h)}>
          <History size={11} /> {meter.versions.length} version{meter.versions.length > 1 ? "s" : ""}
          <ChevronDown size={11} className={cn("transition-transform", hist && "rotate-180")} />
        </button>
        {hist && (
          <div className="space-y-1 pb-2 pt-1">
            {meter.versions.map((v, i) => (
              <div key={v.effective_from} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-accent">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">×{trimZeros(v.mult_factor.toFixed(6))}</span>
                  <span className="text-muted-foreground">from {fmtDate(v.effective_from)}</span>
                  <VersionBadge effective_from={v.effective_from} active={i === idx} />
                  {v.note && <span className="truncate text-muted-foreground">· {v.note}</span>}
                </div>
                <button className="text-muted-foreground hover:text-red-600 disabled:opacity-30" disabled={meter.versions.length === 1} onClick={() => removeVersion(v.effective_from)} title="Remove this version"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConstantCard({ versions, onChange }: { versions: ConstantRow[]; onChange: (r: ConstantRow[]) => void }) {
  const idx = inForceIndex(versions);   // version applying *today*
  const current = versions[idx];
  const [open, setOpen] = useState(false);        // schedule-a-change form
  const [hist, setHist] = useState(false);        // version history
  const [val, setVal] = useState(String(current.cvalue));
  const [date, setDate] = useState(current.effective_from.slice(0, 10));   // edit the in-force version by default
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function schedule() {
    if (val.trim() === "" || isNaN(Number(val))) { toast.error("Enter a numeric value"); return; }
    setBusy(true);
    try {
      const updated = await api.saveConstant({
        ckey: current.ckey, label: current.label, category: current.category, unit: current.unit ?? undefined,
        cvalue: Number(val), effective_from: date, note: note || undefined, updated_by: ACTOR,
      });
      onChange(updated); setOpen(false); setNote("");
      toast.success(`${current.label} updated`, { description: `${fmtNum(Number(val))}${current.unit ? " " + current.unit : ""} effective ${fmtDate(date)}` });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (versions.length === 1) { toast.error("Can't delete the only version"); return; }
    try { onChange(await api.deleteConstant(id, ACTOR)); toast.success("Version removed"); }
    catch (e) { toast.error("Delete failed", { description: String(e) }); }
  }

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{current.label}</div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-mono">{current.ckey}</span>{current.note ? ` · ${current.note}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-primary">{fmtNum(current.cvalue)}<span className="ml-1 text-xs font-medium text-muted-foreground">{current.unit}</span></div>
            <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground"><CalendarClock size={10} /> since {fmtDate(current.effective_from)}</div>
          </div>
          <button className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => { setVal(String(current.cvalue)); setDate(current.effective_from.slice(0, 10)); setOpen((o) => !o); }}>
            <Plus size={13} /> New value
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div>
            <label className={lbl}>New value{current.unit ? ` (${current.unit})` : ""}</label>
            <input className={inp} value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className={lbl}>Effective from</label>
            <input className={inp} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Note (optional)</label>
            <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. per revised OERC order" />
          </div>
          <button className="btn primary h-[38px]" disabled={busy} onClick={schedule}><Save size={14} /> Save</button>
        </div>
      )}

      <div className="border-t px-3 py-1.5">
        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setHist((h) => !h)}>
          <History size={11} /> {versions.length} version{versions.length > 1 ? "s" : ""}
          <ChevronDown size={11} className={cn("transition-transform", hist && "rotate-180")} />
        </button>
        {hist && (
          <div className="space-y-1 pb-2 pt-1">
            {versions.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-accent">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">{fmtNum(v.cvalue)} {v.unit}</span>
                  <span className="text-muted-foreground">from {fmtDate(v.effective_from)}</span>
                  <VersionBadge effective_from={v.effective_from} active={i === idx} />
                  {v.note && <span className="truncate text-muted-foreground">· {v.note}</span>}
                </div>
                <button className="text-muted-foreground hover:text-red-600 disabled:opacity-30" disabled={versions.length === 1} onClick={() => remove(v.id)} title="Remove this version">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- tariff (regulated) editor ---------------- */
const TFIELDS: { key: keyof TariffRow; label: string; unit?: string }[] = [
  { key: "slab_lf_low_rate", label: "Energy slab — LF ≤ threshold", unit: "₹/kVAh" },
  { key: "slab_lf_high_rate", label: "Energy slab — LF > threshold", unit: "₹/kVAh" },
  { key: "lf_threshold_pct", label: "Load-factor threshold", unit: "%" },
  { key: "demand_charge", label: "Demand charge", unit: "₹/kVA/mo" },
  { key: "electricity_duty_pct", label: "Electricity duty", unit: "%" },
  { key: "meter_rent", label: "Meter rent", unit: "₹/mo" },
  { key: "customer_service_charge", label: "Customer service charge", unit: "₹/mo" },
];

function TariffCard({ tariffs, onChange }: { tariffs: TariffRow[]; onChange: (t: TariffRow[]) => void }) {
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<TariffRow>>({});
  const [asNew, setAsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const startEdit = (t: TariffRow, newVersion: boolean) => {
    setEditId(t.id); setAsNew(newVersion);
    setDraft({ ...t, ...(newVersion ? { effective_from: todayIso() } : {}) });
  };
  const set = (k: keyof TariffRow, v: string | number) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      const body: Partial<TariffRow> & { updated_by?: string } = { ...draft, updated_by: ACTOR };
      if (asNew) delete (body as { id?: number }).id;   // POST a new version
      const updated = await api.saveTariff(body);
      onChange(updated); setEditId(null); setAsNew(false);
      toast.success(asNew ? "New tariff version scheduled" : "Tariff updated");
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHead title="Regulated Tariff (OERC / TPNODL)" icon={<Database size={16} />}
        right={<span className="text-xs text-muted-foreground">{tariffs.length} version{tariffs.length > 1 ? "s" : ""}</span>} />
      <CardBody className="space-y-3">
        {tariffs.map((t) => {
          const editing = editId === t.id;
          return (
            <div key={t.id} className="rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <div className="text-sm font-semibold">{t.name} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{t.voltage_class}</span></div>
                  <div className="text-[11px] text-muted-foreground">Effective {fmtDate(t.effective_from)}{t.effective_to ? ` → ${fmtDate(t.effective_to)}` : " → open"}{t.tariff_order_ref ? ` · ${t.tariff_order_ref}` : ""}</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => (editing && !asNew ? setEditId(null) : startEdit(t, false))}>{editing && !asNew ? "Cancel" : "Edit"}</button>
                  <button className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => startEdit(t, true)}><Plus size={13} /> New version</button>
                </div>
              </div>

              {editing && (
                <div className="space-y-3 border-t bg-muted/30 p-3">
                  {asNew && <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-foreground">Scheduling a <b>new tariff version</b> — the current one stays in force until the effective date below.</div>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className={lbl}>Effective from</label>
                      <input className={inp} type="date" value={(draft.effective_from as string)?.slice(0, 10) ?? ""} onChange={(e) => set("effective_from", e.target.value)} />
                    </div>
                    {TFIELDS.map((f) => (
                      <div key={String(f.key)}>
                        <label className={lbl}>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
                        <input className={inp} inputMode="decimal" value={String(draft[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button className="btn primary" disabled={busy} onClick={save}><Save size={14} /> {asNew ? "Schedule version" : "Save tariff"}</button>
                  </div>
                </div>
              )}

              {!editing && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t p-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                  {TFIELDS.map((f) => (
                    <div key={String(f.key)} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">{fmtNum(Number(t[f.key]))} <span className="text-[10px] font-normal text-muted-foreground">{f.unit}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/* ===================== System Configuration tab ===================== */
function SystemTab() {
  const [rows, setRows] = useState<SystemConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.systemConfig().then(setRows).catch((e) => toast.error("Failed to load", { description: String(e) })).finally(() => setLoading(false)); }, []);

  if (loading) return <Card><CardBody><LoadingState /></CardBody></Card>;
  return (
    <Card>
      <CardHead title="System Configuration" icon={<Cpu size={16} />} right={<span className="text-xs text-muted-foreground">{rows.length} keys</span>} />
      <CardBody className="space-y-3">
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
          Structural identifiers. Editable ones apply on the <b className="text-foreground">next backend restart</b>;
          the greyed items are <b className="text-foreground">deployment-level</b> (they decide the source data tables) and are shown for reference.
        </div>
        {rows.map((r) => <SystemRow key={r.cfg_key} row={r} onChange={setRows} />)}
      </CardBody>
    </Card>
  );
}

function SystemRow({ row, onChange }: { row: SystemConfigRow; onChange: (r: SystemConfigRow[]) => void }) {
  const meter = row.kind === "meter";
  const parsed = meter && row.cfg_value ? JSON.parse(row.cfg_value) as { device_id: string; feeder_id: number } : null;
  const [edit, setEdit] = useState(false);
  const [dev, setDev] = useState(parsed?.device_id ?? "");
  const [fdr, setFdr] = useState(String(parsed?.feeder_id ?? ""));
  const [val, setVal] = useState(row.cfg_value ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const value = meter ? { device_id: dev, feeder_id: Number(fdr) } : val;
      onChange(await api.saveSystemConfig(row.cfg_key, value, ACTOR));
      setEdit(false);
      toast.success(`${row.label} saved`, { description: "Applies on the next backend restart." });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }

  return (
    <div className={cn("rounded-xl border", !row.editable && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {!row.editable && <Lock size={12} className="text-muted-foreground" />}{row.label}
          </div>
          <div className="text-[11px] text-muted-foreground"><span className="font-mono">{row.cfg_key}</span>{row.note ? ` · ${row.note}` : ""}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-xs">
            {meter && parsed ? `${parsed.device_id} · feeder ${parsed.feeder_id}` : row.cfg_value ?? "—"}
          </span>
          {row.editable && (
            <button className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => setEdit((e) => !e)}>{edit ? "Cancel" : "Edit"}</button>
          )}
        </div>
      </div>
      {edit && row.editable && (
        <div className="flex flex-wrap items-end gap-3 border-t bg-muted/30 p-3">
          {meter ? (
            <>
              <div><label className={lbl}>Device ID</label><input className={inp} value={dev} onChange={(e) => setDev(e.target.value)} /></div>
              <div><label className={lbl}>Feeder ID</label><input className={inp} value={fdr} onChange={(e) => setFdr(e.target.value)} inputMode="numeric" /></div>
            </>
          ) : (
            <div className="flex-1"><label className={lbl}>{row.label}</label><input className={inp} value={val} onChange={(e) => setVal(e.target.value)} /></div>
          )}
          <button className="btn primary h-[38px]" disabled={busy} onClick={save}><Save size={14} /> Save</button>
        </div>
      )}
    </div>
  );
}

/* ===================== Change Log tab ===================== */
const ENTITY_TONE: Record<string, string> = {
  constant: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  tariff: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  system: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};
const ACTION_TONE: Record<string, string> = {
  create: "text-emerald-600 dark:text-emerald-400",
  update: "text-blue-600 dark:text-blue-400",
  delete: "text-red-600 dark:text-red-400",
};
function ChangeLogTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.audit(200).then(setRows).catch((e) => toast.error("Failed to load", { description: String(e) })).finally(() => setLoading(false)); }, []);

  const fmtWhen = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

  return (
    <Card>
      <CardHead title="Change Log" icon={<History size={16} />} right={<span className="text-xs text-muted-foreground">{rows.length} entries</span>} />
      <CardBody>
        {loading ? <LoadingState label="Loading change log…" className="py-8" />
          : rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No configuration changes recorded yet.</div>
            : (
              <div className="overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="border-b px-3 py-2 text-left">When</th>
                    <th className="border-b px-3 py-2 text-left">Area</th>
                    <th className="border-b px-3 py-2 text-left">Change</th>
                    <th className="border-b px-3 py-2 text-left">Effective</th>
                    <th className="border-b px-3 py-2 text-left">By</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-accent/50">
                        <td className="whitespace-nowrap border-b px-3 py-2 text-xs text-muted-foreground">{fmtWhen(r.changed_at)}</td>
                        <td className="border-b px-3 py-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium capitalize", ENTITY_TONE[r.entity] ?? "bg-muted")}>{r.entity}</span>
                          <span className={cn("ml-1.5 text-[11px] font-semibold uppercase", ACTION_TONE[r.action])}>{r.action}</span>
                        </td>
                        <td className="border-b px-3 py-2">{r.detail}</td>
                        <td className="whitespace-nowrap border-b px-3 py-2 text-xs text-muted-foreground">{r.effective_from ? fmtDate(r.effective_from) : "—"}</td>
                        <td className="whitespace-nowrap border-b px-3 py-2 text-xs">{r.changed_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </CardBody>
    </Card>
  );
}

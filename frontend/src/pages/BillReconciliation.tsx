import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, FileText, IndianRupee, Pencil, Save, Scale, X,
} from "lucide-react";
import { api, type ActualBill, type Recon } from "../api";
import { Card, CardHead, CardBody, StatusChip, LoadingState } from "../components/premium";
import { useScope } from "../stores/scope";
import { cn } from "../lib/utils";

const inr = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const cr = (v: number) => `₹ ${(v / 1e7).toFixed(2)} Cr`;
const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

// actual-bill entry fields (grouped)
const HEADER_FIELDS: { k: keyof ActualBill; label: string; text?: boolean }[] = [
  { k: "bill_no", label: "Bill No.", text: true },
  { k: "kwh_total", label: "kWh (billed)" },
  { k: "kvah_total", label: "kVAh (billed)" },
  { k: "power_factor", label: "Power Factor" },
];
const CHARGE_FIELDS: { k: keyof ActualBill; label: string }[] = [
  { k: "energy_charge", label: "Energy Charge ₹" },
  { k: "tod_charge", label: "Time of Day (net) ₹" },
  { k: "demand_charge", label: "Demand / MMFC ₹" },
  { k: "pf_charge", label: "Power-Factor Penalty ₹" },
  { k: "electricity_duty", label: "Electricity Duty ₹" },
  { k: "dps", label: "Delayed-Payment Surcharge ₹" },
  { k: "net_payable", label: "Net Payable ₹" },
];

export default function BillReconciliation() {
  const { range } = useScope();
  const [months, setMonths] = useState<string[]>([]);
  const scopeMonth = range.end.slice(0, 7);
  const month = months.length ? (months.includes(scopeMonth) ? scopeMonth : months[0]) : scopeMonth;

  const [r, setR] = useState<Recon | null>(null);
  const [actual, setActual] = useState<ActualBill>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.accountingMonths().then(setMonths).catch(() => {}); }, []);
  useEffect(() => {
    if (!month) return;
    setLoading(true); setR(null); setEditing(false);
    api.recon(month).then(setR).catch((e) => toast.error("Failed to rebuild bill", { description: String(e) })).finally(() => setLoading(false));
    api.reconActual(month).then((a) => setActual(a ?? {})).catch(() => setActual({}));
  }, [month]);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.saveReconActual(month, actual);
      setR(updated); setEditing(false);
      toast.success("Actual bill saved", { description: `Reconciled ${fmtMonth(month)}` });
    } catch (e) { toast.error("Save failed", { description: String(e) }); } finally { setBusy(false); }
  }
  const setF = (k: keyof ActualBill, v: string, text?: boolean) =>
    setActual((a) => ({ ...a, [k]: text ? v : (v === "" ? null : Number(v)) }));

  const inp = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary tabular-nums";
  const lbl = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>Bill Reconciliation</h1>
          <div className="sub">The TPNODL bill rebuilt from meter data with the authoritative tariff engine, compared line-by-line to the actual utility bill.</div>
        </div>
      </div>

      {loading && <LoadingState label="Rebuilding bill…" />}

      {r && r.components.length > 0 && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<IndianRupee size={16} />} tone="info" label="Computed Bill" value={cr(r.computed_total)}
              sub={`${fmtMonth(month)} · ₹${Number(r.inputs.per_unit_rate).toFixed(3)}/kWh`} />
            <Stat icon={<FileText size={16} />} tone="neutral" label="Actual Bill"
              value={r.actual_total != null ? cr(r.actual_total) : "—"}
              sub={r.has_actual ? "entered" : "not entered yet"} />
            <Stat icon={<Scale size={16} />} tone={varTone(r.total_variance_pct)} label="Variance"
              value={r.total_variance != null ? `₹ ${(r.total_variance / 1e7).toFixed(2)} Cr` : "—"}
              sub={r.total_variance_pct != null ? `${r.total_variance_pct > 0 ? "+" : ""}${r.total_variance_pct}% vs actual` : "enter actual to compare"} />
            <Stat icon={r.status === "matched" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              tone={r.status === "matched" ? "success" : r.status === "review" ? "danger" : "neutral"}
              label="Reconciliation"
              value={r.status === "matched" ? "Matched" : r.status === "review" ? "Review" : "Pending"}
              sub={r.status ? `within ${r.status === "matched" ? "±2%" : ">2% gap"}` : "awaiting actual bill"} />
          </div>

          {!r.inputs.complete && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-foreground">
              This month is incomplete — the computed side covers {Number(r.inputs.days).toFixed(0)} of {String(r.inputs.days_in_month)} days (month-to-date), so totals will grow.
            </div>
          )}

          {/* comparison table */}
          <Card>
            <CardHead title="Line-by-Line Reconciliation" icon={<Scale size={16} />}
              right={r.has_actual && r.status
                ? <StatusChip tone={r.status === "matched" ? "success" : "warning"} dot>{r.status === "matched" ? "Matched" : "Needs review"}</StatusChip>
                : <button className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => setEditing(true)}><Pencil size={13} /> Enter actual bill</button>} />
            <CardBody className="px-0">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 pb-2 text-left font-medium">Component</th>
                      <th className="pb-2 text-right font-medium">Computed ₹</th>
                      <th className="pb-2 text-right font-medium">Actual ₹</th>
                      <th className="pb-2 text-right font-medium">Variance ₹</th>
                      <th className="px-5 pb-2 text-right font-medium">Variance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.components.map((c) => (
                      <tr key={c.component} className="border-b border-border/40 last:border-0">
                        <td className="px-5 py-2">
                          <div className="font-medium">{c.component}</div>
                          {c.note && <div className="text-[11px] text-muted-foreground">{c.note}</div>}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{inr(c.computed)}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{c.actual != null ? inr(c.actual) : "—"}</td>
                        <td className={cn("py-2 text-right tabular-nums", varClass(c.variance_pct))}>
                          {c.variance != null ? `${c.variance > 0 ? "+" : ""}${inr(c.variance)}` : "—"}
                        </td>
                        <td className={cn("px-5 py-2 text-right tabular-nums", varClass(c.variance_pct))}>
                          {c.variance_pct != null ? `${c.variance_pct > 0 ? "+" : ""}${c.variance_pct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="py-2.5 text-right tabular-nums">{inr(r.computed_total)}</td>
                      <td className="py-2.5 text-right tabular-nums">{r.actual_total != null ? inr(r.actual_total) : "—"}</td>
                      <td className={cn("py-2.5 text-right tabular-nums", varClass(r.total_variance_pct))}>
                        {r.total_variance != null ? `${r.total_variance > 0 ? "+" : ""}${inr(r.total_variance)}` : "—"}
                      </td>
                      <td className={cn("px-5 py-2.5 text-right tabular-nums", varClass(r.total_variance_pct))}>
                        {r.total_variance_pct != null ? `${r.total_variance_pct > 0 ? "+" : ""}${r.total_variance_pct}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* actual bill entry */}
          {(editing || r.has_actual) && (
            <Card>
              <CardHead title="Actual TPNODL Bill" icon={<FileText size={16} />}
                right={editing
                  ? <button className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
                  : <button className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>} />
              <CardBody className="space-y-4">
                {editing ? (
                  <>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bill header</div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {HEADER_FIELDS.map((f) => (
                          <div key={f.k}>
                            <label className={lbl}>{f.label}</label>
                            <input className={inp} inputMode={f.text ? "text" : "decimal"}
                              value={(actual[f.k] as string | number | null) ?? ""} onChange={(e) => setF(f.k, e.target.value, f.text)} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Charges (₹)</div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {CHARGE_FIELDS.map((f) => (
                          <div key={f.k}>
                            <label className={lbl}>{f.label}</label>
                            <input className={inp} inputMode="decimal"
                              value={(actual[f.k] as number | null) ?? ""} onChange={(e) => setF(f.k, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button className="btn primary" disabled={busy} onClick={save}><Save size={14} /> Save actual bill</button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-3">
                    {[...HEADER_FIELDS, ...CHARGE_FIELDS].map((f) => (
                      <div key={f.k} className="flex items-baseline justify-between gap-2 border-b border-border/30 py-1">
                        <span className="text-muted-foreground">{f.label.replace(" ₹", "")}</span>
                        <span className="font-medium tabular-nums">
                          {actual[f.k] == null ? "—" : (HEADER_FIELDS.find((x) => x.k === f.k)?.text ? String(actual[f.k]) : inr(Number(actual[f.k])))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* basis */}
          <div className="rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <b className="text-foreground">Basis.</b> kWh {inr(Number(r.inputs.kwh))} · kVAh {inr(Number(r.inputs.kvah))} · MD {inr(Number(r.inputs.md_kva))} kVA ·
            billable {inr(Number(r.inputs.billable_demand_kva))} kVA · LF {Number(r.inputs.load_factor_pct).toFixed(1)}%. {r.note}
          </div>
        </>
      )}
      {r && r.components.length === 0 && <div className="rounded-xl border p-6 text-center text-muted-foreground">{r.note}</div>}
    </div>
  );
}

function varTone(pct: number | null): keyof typeof TONE {
  if (pct == null) return "neutral";
  return Math.abs(pct) <= 2 ? "success" : "danger";
}
function varClass(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  return Math.abs(pct) <= 2 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

const TONE: Record<string, string> = { danger: "#EF4444", warning: "#F59E0B", info: "#2563EB", success: "#10B981", neutral: "#64748B" };
function Stat({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: keyof typeof TONE; label: string; value: string; sub?: string }) {
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

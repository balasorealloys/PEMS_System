import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Shield, ShieldCheck, Trash2, User, UserPlus } from "lucide-react";
import { api, type EmployeeHit, type RoleRow } from "../api";
import { Card, CardHead, CardBody } from "../components/premium";
import { cn } from "../lib/utils";

const ROLES = [
  { key: "admin", label: "Admin", desc: "Full access — settings, tariff, SAP, roles" },
  { key: "manager", label: "Manager", desc: "Operate — SAP posting, bill entry, mapping" },
  { key: "viewer", label: "Viewer", desc: "Read-only" },
] as const;
const ROLE_TONE: Record<string, string> = {
  admin: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  manager: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  viewer: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
};

export default function UserManagement() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [picked, setPicked] = useState<EmployeeHit | null>(null);
  const [role, setRole] = useState<string>("viewer");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.roles().then(setRows).catch((e) => toast.error("Failed to load roles", { description: String(e) })).finally(() => setLoading(false)); }, []);

  // debounced employee search
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { api.searchEmployees(q).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function grant() {
    if (!picked) return;
    setBusy(true);
    try {
      setRows(await api.setRole(picked.emp_id, role));
      toast.success("Role granted", { description: `${picked.name} → ${role}` });
      setPicked(null); setQ(""); setHits([]); setRole("viewer");
    } catch (e) { toast.error("Failed", { description: String(e) }); } finally { setBusy(false); }
  }
  async function changeRole(emp_id: string, newRole: string) {
    try { setRows(await api.setRole(emp_id, newRole)); } catch (e) { toast.error("Failed", { description: String(e) }); }
  }
  async function revoke(emp_id: string, name: string) {
    try { setRows(await api.deleteRole(emp_id)); toast.success(`${name} reverted to Viewer`); }
    catch (e) { toast.error("Failed", { description: String(e) }); }
  }

  const inp = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>User Management</h1>
          <div className="sub">Grant PEMS access roles. Anyone with an intranet login can sign in as a <b>Viewer</b> by default; assign higher roles here.</div>
        </div>
      </div>

      {/* grant a role */}
      <Card>
        <CardHead title="Grant a role" icon={<UserPlus size={16} />} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employee</label>
              {picked ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span><b>{picked.name}</b> <span className="font-mono text-xs text-muted-foreground">{picked.emp_id}</span></span>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setPicked(null)}>change</button>
                </div>
              ) : (
                <>
                  <Search size={15} className="pointer-events-none absolute left-3 top-[30px] text-muted-foreground" />
                  <input className={cn(inp, "pl-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or Employee ID…" />
                  {hits.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-card shadow-lg">
                      {hits.map((h) => (
                        <button key={h.emp_id} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => { setPicked(h); setHits([]); }}>
                          <User size={14} className="text-muted-foreground" />
                          <span className="flex-1"><b>{h.name}</b> <span className="text-xs text-muted-foreground">{h.designation ?? ""}</span></span>
                          <span className="font-mono text-[11px] text-muted-foreground">{h.emp_id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
              <select className={inp} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <button className="btn primary h-[38px]" disabled={!picked || busy} onClick={grant}><ShieldCheck size={15} /> Grant</button>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {ROLES.map((r) => <span key={r.key}><b className="text-foreground">{r.label}:</b> {r.desc}</span>)}
          </div>
        </CardBody>
      </Card>

      {/* assigned roles */}
      <Card>
        <CardHead title="Assigned roles" icon={<Shield size={16} />} right={<span className="text-xs text-muted-foreground">{rows.length}</span>} />
        <CardBody className="px-0">
          {loading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 pb-2 text-left font-medium">Employee</th>
                <th className="pb-2 text-left font-medium">Designation</th>
                <th className="pb-2 text-left font-medium">Role</th>
                <th className="px-5 pb-2 text-right font-medium" />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.emp_id} className="border-b border-border/40 last:border-0">
                    <td className="px-5 py-2"><b>{r.name}</b> <span className="font-mono text-[11px] text-muted-foreground">{r.emp_id}</span></td>
                    <td className="py-2 text-muted-foreground">{r.designation ?? "—"}</td>
                    <td className="py-2">
                      <select className={cn("rounded-md border-0 px-2 py-1 text-xs font-medium", ROLE_TONE[r.role])}
                        value={r.role} onChange={(e) => changeRole(r.emp_id, e.target.value)}>
                        {ROLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-2 text-right">
                      <button className="text-muted-foreground hover:text-red-600" title="Revoke (revert to Viewer)" onClick={() => revoke(r.emp_id, r.name)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">No roles assigned yet.</td></tr>}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

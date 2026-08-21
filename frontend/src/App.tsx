import { useEffect, useState } from "react";
import AppShell, { type ViewKey } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import FeederMapping from "./pages/FeederMapping";
import Accounting from "./pages/Accounting";
import SapPosting from "./pages/SapPosting";
import BillReconciliation from "./pages/BillReconciliation";
import SystemSettings from "./pages/SystemSettings";
import UserManagement from "./pages/UserManagement";
import Guide from "./pages/Guide";
import Login from "./pages/Login";
import { api, type Executive } from "./api";
import { useExecutive } from "./hooks/queries";
import { useAuth } from "./stores/auth";

export default function App() {
  const [view, setView] = useState<ViewKey>(
    () => (localStorage.getItem("pems.view") as ViewKey) || "dashboard");
  const { status, check, user } = useAuth();
  const isAdmin = user?.pems_role === "admin";

  // establish the session on load
  useEffect(() => { check(); }, [check]);

  // record a page view whenever the active view changes (while signed in)
  useEffect(() => {
    if (status === "authed") api.track(`/${view}`);
  }, [view, status]);

  // keep the session alive while the tab is open
  useEffect(() => {
    if (status !== "authed") return;
    const id = setInterval(() => api.heartbeat(), 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [status]);

  const { data: exec } = useExecutive();
  const navigate = (v: ViewKey) => { setView(v); localStorage.setItem("pems.view", v); };

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (status === "anon") return <Login />;

  return (
    <AppShell view={view} onNavigate={navigate} status={<StatusBar s={exec?.status ?? null} />}>
      {view === "dashboard" && <Dashboard />}
      {view === "mapping" && <FeederMapping />}
      {view === "accounting" && <Accounting />}
      {view === "sap" && <SapPosting onNavigate={navigate} />}
      {view === "recon" && <BillReconciliation />}
      {view === "settings" && (isAdmin ? <SystemSettings onNavigate={navigate} /> : <NoAccess />)}
      {view === "users" && (isAdmin ? <UserManagement /> : <NoAccess />)}
      {view === "guide" && <Guide onNavigate={navigate} />}
    </AppShell>
  );
}

function NoAccess() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <div className="text-lg font-semibold text-foreground">Access restricted</div>
      <div className="text-sm">This section is available to administrators only. Contact your PEMS admin for access.</div>
    </div>
  );
}

function StatusBar({ s }: { s: Executive["status"] | null }) {
  if (!s) return <span className="muted">Connecting to plant data…</span>;
  const t = new Date(s.last_update).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <>
      <span className="status-item"><span className="dot ok" /> Last update <b>{t}</b></span>
      <span className="status-item"><span className={`dot ${s.rtus_online === s.rtus_total ? "ok" : "warn"}`} /> RTUs <b>{s.rtus_online}/{s.rtus_total}</b></span>
      <span className="status-item">Feeders <b>{s.feeders_online}/{s.feeders_total}</b></span>
      <span className="status-item">Data points today <b>{s.data_points_today.toLocaleString("en-IN")}</b></span>
      <span className="status-item" style={{ marginLeft: "auto" }}>
        <span className={`dot ${s.healthy ? "ok" : "warn"}`} /> System <b>{s.healthy ? "Healthy" : "Degraded"}</b>
      </span>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Activity, Calculator, Database, FileText, CalendarClock,
  LineChart, ShoppingCart, Sparkles, Bell, BarChart3, Network, Users, Settings,
  ClipboardList, Zap, Search, Sun, Moon, Maximize, PanelLeft, BookOpen,
  ChevronUp, ChevronDown, LogOut, AlertTriangle, Info, CheckCircle2, type LucideIcon,
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import { LiveClock, DateRangePicker, PlantSelector } from "./premium";
import { useAuth } from "../stores/auth";
import { useAlerts } from "../hooks/queries";
import type { Alert } from "../api";
import balLogo from "../assets/bal-logo.png";

export type ViewKey = "dashboard" | "mapping" | "accounting" | "sap" | "recon" | "settings" | "guide" | "users";

const NAV: { group?: string; items: { key: string; label: string; icon: LucideIcon; view?: ViewKey; adminOnly?: boolean }[] }[] = [
  { items: [{ key: "dashboard", label: "Executive Dashboard", icon: LayoutDashboard, view: "dashboard" }] },
  {
    group: "Operations",
    items: [
      { key: "monitor", label: "Energy Monitoring", icon: Activity },
      { key: "accounting", label: "Energy Accounting", icon: Calculator, view: "accounting" },
      { key: "sap", label: "SAP Integration", icon: Database, view: "sap" },
      { key: "bill", label: "Bill Intelligence", icon: FileText, view: "recon" },
      { key: "schedule", label: "Scheduling", icon: CalendarClock },
    ],
  },
  {
    group: "Market Intelligence",
    items: [
      { key: "market", label: "Market Analysis", icon: LineChart },
      { key: "procurement", label: "Procurement Strategy", icon: ShoppingCart },
    ],
  },
  {
    group: "AI & Insights",
    items: [
      { key: "ai", label: "AI Insights", icon: Sparkles },
      { key: "alerts", label: "Alerts & Notifications", icon: Bell },
    ],
  },
  {
    group: "Reports",
    items: [
      { key: "reports", label: "Reports & Analytics", icon: BarChart3 },
      { key: "guide", label: "User Guide", icon: BookOpen, view: "guide" },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: "mapping", label: "Feeder Mapping", icon: Network, view: "mapping" },
      { key: "users", label: "User Management", icon: Users, view: "users", adminOnly: true },
      { key: "settings", label: "System Settings", icon: Settings, view: "settings", adminOnly: true },
      { key: "audit", label: "Audit Logs", icon: ClipboardList },
    ],
  },
];

export default function AppShell({
  view, onNavigate, status, children,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<"dark" | "light">(
    () => (localStorage.getItem("pems.theme") as "dark" | "light") || "light");
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarW, setSidebarW] = useState<number>(
    () => Number(localStorage.getItem("pems.sidebar.w")) || 248);
  const [dragging, setDragging] = useState(false);
  // status bar collapsed by default; a handle toggles it (persisted)
  const [footerOpen, setFooterOpen] = useState(() => localStorage.getItem("pems.footer") === "open");
  const { user, logout } = useAuth();
  const isAdmin = user?.pems_role === "admin";
  const initials = (user?.name || "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "–";
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const { data: alertsData } = useAlerts();
  const activeAlerts = alertsData?.alerts ?? [];
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pems.alertsRead") || "[]")); } catch { return new Set(); }
  });
  const unreadCount = activeAlerts.filter((a) => !readIds.has(a.id)).length;
  const markAllRead = () => {
    const ids = activeAlerts.map((a) => a.id);
    setReadIds(new Set(ids));
    localStorage.setItem("pems.alertsRead", JSON.stringify(ids));
  };
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  const setTheme = (t: "dark" | "light") => { setThemeState(t); localStorage.setItem("pems.theme", t); };
  const toggleFooter = () => setFooterOpen((o) => { localStorage.setItem("pems.footer", o ? "closed" : "open"); return !o; });

  // --- resizable sidebar (drag the right edge; clamp 200–380px) ---
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const w = Math.min(380, Math.max(200, ev.clientX));
      setSidebarW(w);
    };
    const up = () => {
      setDragging(false);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setSidebarW((w) => { localStorage.setItem("pems.sidebar.w", String(w)); return w; });
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }, [collapsed]);

  const shellStyle = { ["--sidebar-w" as string]: `${collapsed ? 64 : sidebarW}px` } as React.CSSProperties;

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""} ${dragging ? "resizing" : ""} ${footerOpen ? "" : "footer-hidden"}`} style={shellStyle}>
      <header className="topbar">
        <button className="icon-btn ghost" title="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}>
          <PanelLeft size={16} />
        </button>
        <div className="brand">
          <div className="brand-logo"><Zap size={19} /></div>
          <div className="brand-text">
            <div className="brand-name">PEMS</div>
            <div className="brand-tag">Power &amp; Energy Intelligence Platform</div>
          </div>
        </div>
        <div className="topbar-spacer" />
        <button className="searchbox" onClick={() => setPaletteOpen(true)}>
          <Search size={15} />
          <span className="searchbox-text">Search…</span>
          <span className="kbd">Ctrl K</span>
        </button>
        <div className="topbar-spacer" />
        <div className="top-actions">
          <LiveClock />
          <DateRangePicker />
          <PlantSelector />
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="relative">
            <button className="icon-btn" title="Notifications" onClick={() => setBellOpen((o) => !o)}>
              <Bell size={17} />
              {unreadCount > 0 && <span className="badge-dot">{unreadCount}</span>}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg">
                  <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <span className="text-sm font-semibold">Notifications</span>
                    {activeAlerts.length > 0 && unreadCount > 0
                      ? <button className="text-[11px] font-medium text-primary hover:underline" onClick={markAllRead}>Mark all read</button>
                      : <span className="text-[11px] text-muted-foreground">{activeAlerts.length ? "all read" : "all clear"}</span>}
                  </div>
                  <div className="max-h-[60vh] overflow-auto">
                    {activeAlerts.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                        <CheckCircle2 size={22} className="text-emerald-500" />
                        <div className="text-sm font-medium">No active alerts</div>
                        <div className="text-[11px] text-muted-foreground">All systems normal.</div>
                      </div>
                    ) : (
                      activeAlerts.map((a) => <AlertRow key={a.id} a={a} unread={!readIds.has(a.id)} />)
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <button className="icon-btn" title="Fullscreen" onClick={() => document.documentElement.requestFullscreen?.()}>
            <Maximize size={16} />
          </button>
          <div className="relative">
            <div className="profile" style={{ cursor: "pointer" }} role="button" title="Account"
              onClick={() => setMenuOpen((o) => !o)}>
              <div className="avatar">{initials}</div>
              <div>
                <div className="profile-name">{user?.name ?? "—"}</div>
                <div className="profile-role">{user?.role ?? user?.title ?? "Employee"}</div>
              </div>
              <ChevronDown size={14} style={{ marginLeft: 2, opacity: 0.6 }} />
            </div>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border bg-card shadow-lg">
                  <div className="flex items-center gap-3 border-b p-3">
                    <div className="avatar">{initials}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{user?.name ?? "—"}</span>
                        {user?.pems_role && <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">{user.pems_role}</span>}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[user?.role ?? user?.title, user?.department].filter(Boolean).join(" · ") || "Employee"}
                      </div>
                      {user?.email && <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>}
                    </div>
                  </div>
                  <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent"
                    onClick={() => { setMenuOpen(false); onNavigate("settings"); }}>
                    <Settings size={15} /> System Settings
                  </button>
                  <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent"
                    onClick={() => { setMenuOpen(false); onNavigate("guide"); }}>
                    <BookOpen size={15} /> User Guide
                  </button>
                  <div className="h-px bg-border" />
                  <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    onClick={() => { setMenuOpen(false); logout(); }}>
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="sidebar">
        {!collapsed && (
          <div className="sidebar-resizer" onPointerDown={startDrag} title="Drag to resize" />
        )}
        {NAV.map((g, i) => (
          <div key={i}>
            {g.group && <div className="nav-group-label">{g.group}</div>}
            {g.items.filter((it) => !it.adminOnly || isAdmin).map((it) => {
              const active = it.view === view;
              const clickable = !!it.view;
              const IconC = it.icon;
              return (
                <div
                  key={it.key}
                  className={`nav-item ${active ? "active" : ""} ${clickable ? "" : "disabled"}`}
                  onClick={() => it.view && onNavigate(it.view)}
                >
                  <IconC size={17} />
                  <span>{it.label}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div className="sidebar-footer">
          <img src={balLogo} alt="Balasore Alloys Limited" className="plant-ico" style={{ width: 34, height: "auto", objectFit: "contain" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>Balasore Alloys Ltd</div>
            <div className="muted" style={{ fontSize: 11 }}>Balasore, Odisha, India</div>
          </div>
        </div>
      </nav>

      <main className="main">{children}</main>
      <footer className="statusbar">{status}</footer>
      <button className="footer-toggle" onClick={toggleFooter} title={footerOpen ? "Hide status bar" : "Show status bar"}>
        {footerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} onNavigate={onNavigate} />
    </div>
  );
}

const SEV: Record<Alert["severity"], { color: string; Icon: LucideIcon }> = {
  critical: { color: "#EF4444", Icon: AlertTriangle },
  warning: { color: "#F59E0B", Icon: AlertTriangle },
  info: { color: "#2563EB", Icon: Info },
};
function AlertRow({ a, unread }: { a: Alert; unread?: boolean }) {
  const { color, Icon } = SEV[a.severity];
  return (
    <div className={`flex items-start gap-2.5 border-b px-3 py-2.5 last:border-0 ${unread ? "bg-primary/[0.04]" : ""}`}>
      <Icon size={15} style={{ color, marginTop: 1, flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{a.title}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">{a.message}</div>
      </div>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" title="Unread" />}
    </div>
  );
}

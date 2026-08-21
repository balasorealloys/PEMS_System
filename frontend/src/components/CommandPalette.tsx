import { useEffect } from "react";
import { Command } from "cmdk";
import {
  LayoutDashboard, Network, Calculator, Database, FileText,
} from "lucide-react";
import type { ViewKey } from "./AppShell";

const ITEMS: { view: ViewKey; label: string; hint: string; icon: React.ReactNode }[] = [
  { view: "dashboard", label: "Executive Dashboard", hint: "live plant overview", icon: <LayoutDashboard size={16} /> },
  { view: "mapping", label: "Feeder Mapping", hint: "SLD · cost centers", icon: <Network size={16} /> },
  { view: "accounting", label: "Energy Accounting", hint: "tariff rate · cost centers", icon: <Calculator size={16} /> },
  { view: "sap", label: "SAP Posting", hint: "daily cost posting", icon: <Database size={16} /> },
  { view: "recon", label: "Bill Reconciliation", hint: "TPNODL bill", icon: <FileText size={16} /> },
];

export default function CommandPalette({
  open, setOpen, onNavigate,
}: { open: boolean; setOpen: (v: boolean) => void; onNavigate: (v: ViewKey) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu" className="cmdk-root">
      <Command.Input placeholder="Jump to a module…" className="cmdk-input" />
      <Command.List className="cmdk-list">
        <Command.Empty className="cmdk-empty">No matches.</Command.Empty>
        <Command.Group heading="Navigate" className="cmdk-group">
          {ITEMS.map((it) => (
            <Command.Item key={it.view} value={`${it.label} ${it.hint}`}
              onSelect={() => { onNavigate(it.view); setOpen(false); }} className="cmdk-item">
              <span className="cmdk-ico">{it.icon}</span>
              <span>{it.label}</span>
              <span className="cmdk-hint">{it.hint}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

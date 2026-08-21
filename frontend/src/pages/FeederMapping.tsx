import { useEffect, useMemo, useState } from "react";
import { api, type Load, type Meter, type Summary } from "../api";
import { toast } from "sonner";
import Icon from "../components/Icon";
import CostCenterMap from "./CostCenterMap";
import SldTree from "./SldTree";
import FeederTable from "../components/FeederTable";

type Filter = "all" | "unmapped" | "unconfirmed" | "mapped";

export default function FeederMapping() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<"table" | "map" | "sld">(
    () => (localStorage.getItem("pems.map.view") as "table" | "map" | "sld") || "sld");
  const setView = (v: "table" | "map" | "sld") => {
    setViewState(v); localStorage.setItem("pems.map.view", v);
  };

  // Tab filter applied client-side (the table handles its own search + sorting).
  const filtered = useMemo(() => meters.filter((m) => {
    const mp = m.mappings[0];
    if (filter === "unmapped") return !mp;
    if (filter === "mapped") return !!mp;
    if (filter === "unconfirmed") return mp && !mp.is_confirmed;
    return true;
  }), [meters, filter]);

  async function refresh() {
    setError(null);
    try {
      const [s, m] = await Promise.all([api.summary(), api.meters()]);
      setSummary(s);
      setMeters(m);
    } catch (e) { setError(String(e)); }
  }

  useEffect(() => { api.loads().then(setLoads).catch((e) => setError(String(e))); }, []);
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  async function assign(meter: Meter, loadId: number) {
    setBusy(true);
    try {
      if (!loadId) { for (const mp of meter.mappings) await api.remove(mp.map_id); }
      else await api.upsert({ load_id: loadId, device_id: meter.device_id, feeder_id: meter.feeder_id });
      await refresh();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function confirmOne(mapId: number) {
    setBusy(true);
    try { await api.confirm(mapId); await refresh(); } finally { setBusy(false); }
  }

  async function confirmAllHighConfidence() {
    setBusy(true);
    try {
      const r = await api.confirmAll(90);
      await refresh();
      toast.success(`Confirmed ${r.confirmed} high-confidence mappings`, { description: "Auto-suggested mappings with score ≥ 90 are now confirmed." });
    } finally { setBusy(false); }
  }

  if (view === "map") return <CostCenterMap onBack={() => setView("table")} />;
  if (view === "sld") return <SldTree onBack={() => setView("table")} />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Feeder Mapping</h1>
          <div className="sub">Map each meter → load → SAP cost center. Review and confirm the suggested mappings.</div>
        </div>
        <div className="head-controls">
          <button className="btn" onClick={() => setView("sld")}>
            <Icon name="sap" size={15} /> SLD Diagram
          </button>
          <button className="btn" onClick={() => setView("map")}>
            <Icon name="grid" size={15} /> Cost Center Map
          </button>
          <button className="btn primary" disabled={busy} onClick={confirmAllHighConfidence}>
            <Icon name="check" size={15} /> Confirm high-confidence
          </button>
        </div>
      </div>

      {summary && (
        <div className="stat-strip">
          <Strip v={summary.total_meters} l={`Meters · ${summary.enabled_meters} enabled`} />
          <Strip v={summary.mapped_meters} l="Mapped" tone="ok" />
          <Strip v={summary.unmapped_meters} l="Unmapped" tone={summary.unmapped_meters ? "warn" : "ok"} />
          <Strip v={summary.confirmed_mappings} l="Confirmed" tone="ok" />
          <Strip v={summary.unconfirmed_mappings} l="Suggested" tone={summary.unconfirmed_mappings ? "warn" : "ok"} />
          <Strip v={`${summary.mapped_loads}/${summary.total_loads}`} l="Loads mapped" />
        </div>
      )}

      <div className="toolbar">
        <div className="tabs">
          {(["all", "unmapped", "unconfirmed", "mapped"] as Filter[]).map((f) => (
            <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <FeederTable
        meters={filtered} loads={loads} busy={busy}
        onAssign={assign} onConfirm={confirmOne}
      />
    </div>
  );
}

function Strip({ v, l, tone }: { v: number | string; l: string; tone?: "ok" | "warn" }) {
  return <div className={`strip-stat ${tone ?? ""}`}><div className="v">{v}</div><div className="l">{l}</div></div>;
}

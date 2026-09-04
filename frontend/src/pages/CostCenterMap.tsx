import { useEffect, useState } from "react";
import { api, type MappingTree, type TreeCostCenter, type TreeFeeder } from "../api";
import Icon from "../components/Icon";
import { LoadingState } from "../components/premium";

const PALETTE = ["#4f7cff", "#22d3ee", "#34d399", "#fbbf24", "#a78bfa", "#f87171",
  "#38bdf8", "#f472b6", "#2dd4bf", "#facc15"];

export default function CostCenterMap({ onBack }: { onBack: () => void }) {
  const [t, setT] = useState<MappingTree | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.tree().then(setT).catch((e) => setErr(String(e))); }, []);

  if (err) return <div className="error">Failed to load map: {err}</div>;
  if (!t) return <LoadingState label="Building cost-center map…" />;

  const totalKw = t.cost_centers.reduce((s, c) => s + Math.max(c.kw, 0), 0) || 1;
  const totalFeeders = t.cost_centers.reduce((s, c) => s + c.feeder_count, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb" onClick={onBack}>
            <Icon name="chevron" size={14} /> <span>Feeder Mapping</span>
          </div>
          <h1>Cost Center ↔ Feeder Map</h1>
          <div className="sub">
            How each physical meter rolls up — feeder → load → SAP cost center — with live load.
          </div>
        </div>
        <button className="btn" onClick={onBack}><Icon name="masterdata" size={15} /> Back to table</button>
      </div>

      <div className="stat-strip">
        <Strip v={t.cost_centers.length} l="Cost Centers" />
        <Strip v={totalFeeders} l="Mapped Feeders" tone="ok" />
        <Strip v={`${(totalKw / 1000).toFixed(1)} MW`} l="Live Allocated Load" />
        <Strip v={t.unmapped.length} l="Unmapped Feeders" tone={t.unmapped.length ? "warn" : "ok"} />
      </div>

      {/* share bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div className="card-title"><Icon name="gauge" size={16} /> Live Load Distribution by Cost Center</div>
          <span className="live-badge"><span className="dot ok" /> Live</span>
        </div>
        <div className="share-bar">
          {t.cost_centers.filter((c) => c.kw > 0).map((c, i) => (
            <div key={c.sap_costcenter} className="share-seg"
              style={{ width: `${(c.kw / totalKw) * 100}%`, background: PALETTE[i % PALETTE.length] }}
              title={`${c.description}: ${(c.kw / 1000).toFixed(2)} MW`} />
          ))}
        </div>
        <div className="legend-row">
          {t.cost_centers.filter((c) => c.kw > 0).slice(0, 8).map((c, i) => (
            <div key={c.sap_costcenter} className="legend-item">
              <span className="legend-swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
              {c.description} <span className="muted">{(c.kw / 1000).toFixed(1)} MW</span>
            </div>
          ))}
        </div>
      </div>

      {/* cost center cards */}
      <div className="cc-grid">
        {t.cost_centers.map((c, i) => (
          <CostCenterCard key={c.sap_costcenter} cc={c} color={PALETTE[i % PALETTE.length]} />
        ))}
      </div>

      {t.structural.length > 0 && (
        <>
          <h3 className="section-h">Structural (grid & auxiliary — not costed)</h3>
          <div className="cc-grid">
            {t.structural.map((l) => (
              <div className="card cc-card" key={l.load_code} style={{ borderLeftColor: "#6f7a92" }}>
                <div className="cc-head">
                  <div>
                    <div className="cc-name">{l.load_name}</div>
                    <div className="cc-code muted">{l.load_type}</div>
                  </div>
                  <div className="cc-kw">{(l.kw / 1000).toFixed(2)}<small> MW</small></div>
                </div>
                <FeederChips feeders={l.feeders} />
              </div>
            ))}
          </div>
        </>
      )}

      {t.unmapped.length > 0 && (
        <>
          <h3 className="section-h">Unmapped feeders ({t.unmapped.length})</h3>
          <div className="chip-wrap card" style={{ padding: 14 }}>
            {t.unmapped.map((f) => (
              <span key={`${f.device_id}-${f.feeder_id}`} className="feeder-chip muted-chip">
                <b className="mono">{f.device_id}/{f.feeder_id}</b> {f.feeder_name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CostCenterCard({ cc, color }: { cc: TreeCostCenter; color: string }) {
  return (
    <div className="card cc-card" style={{ borderLeftColor: color }}>
      <div className="cc-head">
        <div>
          <div className="cc-name">{cc.description}</div>
          <div className="cc-code mono muted">{cc.sap_costcenter}</div>
        </div>
        <div className="cc-kw" style={{ color }}>{(cc.kw / 1000).toFixed(2)}<small> MW</small></div>
      </div>
      <div className="cc-meta muted">{cc.loads.length} load(s) · {cc.feeder_count} feeder(s)</div>
      <div className="cc-loads">
        {cc.loads.map((l) => (
          <div className="cc-load" key={l.load_code}>
            <div className="cc-load-head">
              <span className="cc-load-name">{l.load_name}</span>
              <span className="muted">{(l.kw / 1000).toFixed(2)} MW</span>
            </div>
            <FeederChips feeders={l.feeders} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeederChips({ feeders }: { feeders: TreeFeeder[] }) {
  return (
    <div className="chip-wrap">
      {feeders.map((f) => (
        <span key={`${f.device_id}-${f.feeder_id}`}
          className={`feeder-chip ${f.is_confirmed ? "" : "sug"}`}
          title={`${f.device_id}/${f.feeder_id} · ${f.kw} kW`}>
          <span className="mono fc-id">{f.device_id}/{f.feeder_id}</span>
          <span className="fc-name">{f.feeder_name}</span>
          {f.coefficient !== 1 && (
            <span className={`coef ${f.coefficient < 0 ? "neg" : ""}`}>
              {f.coefficient < 0 ? "−" : "×"}{Math.abs(f.coefficient)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Strip({ v, l, tone }: { v: number | string; l: string; tone?: "ok" | "warn" }) {
  return <div className={`strip-stat ${tone ?? ""}`}><div className="v">{v}</div><div className="l">{l}</div></div>;
}

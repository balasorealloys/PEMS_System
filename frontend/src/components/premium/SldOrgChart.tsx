import Icon, { type IconName } from "../Icon";
import type { SldNode } from "../../api";
import type { SldMode } from "./SldFlow";
import { sldKey } from "./SldFlow";

// The original indented org-chart SLD (kept as an alternate view alongside React Flow).
// Uses the .tchart/.tnode/.onode/.hbus/.vtree styles in styles.css.
const ROLE_ICON: Record<string, IconName> = {
  grid: "grid", furnace: "furnace", incomer: "sap", aux: "settings", unknown: "gauge",
};
const BRANCH_COLORS = ["#fb923c", "#34d399", "#4f7cff", "#a78bfa", "#22d3ee", "#f472b6", "#facc15", "#f87171"];
const fmtP = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${kw.toFixed(0)} kW`);

export default function SldOrgChart({
  roots, mode, collapsed, onToggle, colorOf,
}: {
  roots: SldNode[]; mode: SldMode; collapsed: Set<string>;
  onToggle: (k: string) => void; colorOf: (n: SldNode) => string;
}) {
  return (
    <div className="tchart">
      {roots.map((r) => (
        <OrgNode key={sldKey(r)} n={r} depth={0} accent={colorOf(r)}
          collapsed={collapsed} onToggle={onToggle} mode={mode} colorOf={colorOf} />
      ))}
    </div>
  );
}

function NodeCard({ n, open, accent, roleColor, mode, colorOf, onToggle }: {
  n: SldNode; open: boolean; accent: string; roleColor: string; mode: SldMode;
  colorOf: (n: SldNode) => string; onToggle: (k: string) => void;
}) {
  const leaves = n.children.filter((c) => c.children.length === 0);
  const hasKids = n.children.length > 0;
  const ccMode = mode === "cc";
  const hasCC = !!n.sld_costcenter;
  const cardAccent = ccMode ? roleColor : accent;
  const dim = ccMode && !hasCC;
  return (
    <div className={`tnode ${dim ? "dim" : ""}`} style={{ borderColor: cardAccent } as React.CSSProperties}>
      <div className="tnode-head">
        <span className="tnode-ico" style={{ background: `color-mix(in srgb, ${roleColor} 18%, transparent)`, color: roleColor }}>
          <Icon name={ROLE_ICON[n.role] ?? "gauge"} size={13} />
        </span>
        <span className="tnode-name" title={n.feeder_name}>{n.feeder_name}</span>
        {n.loss_kw != null && n.loss_kw !== 0 && (
          <span className={`loss-badge ${n.loss_kw > 0 ? "" : "neg"}`}>
            {fmtP(Math.abs(n.loss_kw))} {n.loss_pct != null ? `(${Math.abs(n.loss_pct)}%)` : ""}
          </span>
        )}
      </div>
      <div className="tnode-body">
        <span className="mono tnode-id">{n.device_id}/{n.feeder_id}</span>
        <span className="tnode-mw" style={{ color: cardAccent }}>{fmtP(n.kw)}</span>
      </div>
      {ccMode && (
        <div className="tnode-cc" style={{ color: roleColor }}>
          {hasCC ? <><b>{n.sld_costcenter}</b> {n.costcenter_desc ?? ""}</> : <span className="muted">rolls up → parent / misc</span>}
        </div>
      )}
      {open && leaves.length > 0 && (
        <div className="tnode-leaves">
          {leaves.map((l) => (
            <div className="leaf-row" key={sldKey(l)}>
              <span className="leaf-dot" style={{ background: colorOf(l) }} />
              <span className="leaf-name" title={l.feeder_name}>{l.feeder_name}</span>
              <span className="leaf-mw">{fmtP(l.kw)}</span>
            </div>
          ))}
        </div>
      )}
      {hasKids && (
        <button className="tnode-toggle" onClick={() => onToggle(sldKey(n))} title={open ? "Collapse" : "Expand"}>
          {open ? "−" : `+${n.descendants}`}
        </button>
      )}
    </div>
  );
}

function OrgNode({ n, depth, accent, collapsed, onToggle, mode, colorOf }: {
  n: SldNode; depth: number; accent: string; collapsed: Set<string>; onToggle: (k: string) => void;
  mode: SldMode; colorOf: (n: SldNode) => string;
}) {
  const open = !collapsed.has(sldKey(n));
  const roleColor = colorOf(n);
  const branch = n.children.filter((c) => c.children.length > 0);
  const card = <NodeCard n={n} open={open} accent={accent} roleColor={roleColor} mode={mode} colorOf={colorOf} onToggle={onToggle} />;
  if (!branch.length || !open) return <div className="onode">{card}</div>;

  const horiz = depth === 0 || branch.length >= 3;
  return (
    <div className="onode">
      {card}
      {horiz ? (
        <ul className="hbus">
          {branch.map((c, i) => {
            const bc = depth === 0 ? BRANCH_COLORS[i % BRANCH_COLORS.length] : accent;
            return (
              <li className="col" key={sldKey(c)} style={{ ["--line" as string]: bc } as React.CSSProperties}>
                <OrgNode n={c} depth={depth + 1} accent={bc} collapsed={collapsed} onToggle={onToggle} mode={mode} colorOf={colorOf} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="vtree" style={{ ["--line" as string]: accent } as React.CSSProperties}>
          {branch.map((c) => (
            <div className="vnode" key={sldKey(c)}>
              <OrgNode n={c} depth={depth + 1} accent={accent} collapsed={collapsed} onToggle={onToggle} mode={mode} colorOf={colorOf} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

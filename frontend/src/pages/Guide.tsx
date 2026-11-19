import { useState } from "react";
import { ArrowDown, BookOpen, Calculator, Database, FileText, Gauge, Network, Settings, Sigma, Zap } from "lucide-react";
import type { ViewKey } from "../components/AppShell";

// User Guide — how to use PEMS, module by module. Written to be extended freely.
type Section = { id: string; title: string; icon: React.ReactNode; body: React.ReactNode; go?: ViewKey };

export default function Guide({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const S = SECTIONS();
  const [active, setActive] = useState(S[0].id);
  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1>User Guide</h1>
          <div className="sub">How to use PEMS — mapping, energy accounting, tariff working, and SAP posting.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* TOC */}
        <nav className="hidden lg:block">
          <div className="sticky top-2 rounded-2xl border bg-card p-2">
            {S.map((s) => (
              <button key={s.id} onClick={() => jump(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${active === s.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}>
                <span className="shrink-0">{s.icon}</span>{s.title}
              </button>
            ))}
          </div>
        </nav>

        {/* content */}
        <div className="space-y-4">
          {S.map((s) => (
            <section id={`g-${s.id}`} key={s.id} className="scroll-mt-4 rounded-2xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span className="text-primary">{s.icon}</span>{s.title}
                </div>
                {s.go && (
                  <button className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent" onClick={() => onNavigate(s.go!)}>
                    Open module →
                  </button>
                )}
              </div>
              <div className="prose-guide space-y-2 text-sm leading-relaxed text-muted-foreground">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers to keep the content readable ---------- */
const H = ({ children }: { children: React.ReactNode }) => <div className="mt-3 text-sm font-semibold text-foreground">{children}</div>;
const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="ml-4 list-decimal space-y-1 marker:text-muted-foreground">{items.map((it, i) => <li key={i}>{it}</li>)}</ol>
);
const Bullets = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="ml-4 list-disc space-y-1 marker:text-muted-foreground">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">💡 {children}</div>
);
const K = ({ children }: { children: React.ReactNode }) => <b className="text-foreground">{children}</b>;
// a labelled box + a down-arrow connector, for the data-flow chart
const FlowBox = ({ tone, title, sub }: { tone: string; title: string; sub?: string }) => (
  <div className={`rounded-xl border px-3 py-2.5 text-center ${tone}`}>
    <div className="text-xs font-semibold text-foreground">{title}</div>
    {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);
const Arrow = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center py-1 text-muted-foreground">
    <ArrowDown size={14} />{label && <span className="mt-0.5 text-[10px]">{label}</span>}
  </div>
);
// a formula card: metric name, the equation (mono), and a plain-English note
const Formula = ({ name, eq, desc }: { name: string; eq: React.ReactNode; desc: React.ReactNode }) => (
  <div className="rounded-lg border bg-background/50 p-3">
    <div className="text-sm font-semibold text-foreground">{name}</div>
    <div className="mt-1 font-mono text-[12.5px] leading-relaxed text-primary">{eq}</div>
    <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
  </div>
);

const SECTIONS = (): Section[] => [
  {
    id: "start", title: "Getting Started", icon: <BookOpen size={17} />,
    body: (
      <>
        <p>PEMS turns raw plant meter data into energy accounting, tariff costing, and SAP cost-centre postings for Balasore Alloys.</p>
        <H>Signing in</H>
        <Bullets items={[
          <>PEMS uses your <K>intranet Employee ID and password</K> — the same single sign-on as the other Balasore digital apps. No separate account.</>,
          <>Your name, designation and department are pulled from the employee directory and shown top-right; <K>Sign out</K> is the icon beside your profile.</>,
        ]} />
        <H>The header controls everything</H>
        <Bullets items={[
          <><K>Date picker</K> — the whole app follows the selected period. Click a start then an end date (or a preset, or a month/year heading). It drives Energy Accounting's month and SAP Posting's day/range.</>,
          <><K>Plant selector</K> — scope to a plant (All / Balasore / Jajpur).</>,
          <><K>Search (Ctrl K)</K>, live clock, theme toggle and fullscreen.</>,
        ]} />
        <Note>The status bar at the bottom is hidden by default — click the chevron handle at the bottom-right to show or hide it (your choice is remembered).</Note>
      </>
    ),
  },
  {
    id: "calc", title: "How the Numbers Are Calculated", icon: <Sigma size={17} />,
    body: (
      <>
        <p>Every figure in PEMS traces back to <K>one source — the 132 kV main incomer meter</K> (the same point TPNODL bills you on). <K>Instantaneous</K> values use the latest reading; <K>energy</K> uses the register difference. Here's the whole flow, then the exact formula behind each card.</p>

        <H>Where every number comes from</H>
        <div className="my-2 rounded-xl border bg-background/40 p-4">
          <FlowBox tone="border-primary/30 bg-primary/10" title="132 kV Main Incomer Meter" sub="TPNODL metering point · readings every minute" />
          <Arrow label="splits into two" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FlowBox tone="border-amber-500/30 bg-amber-500/10" title="Latest reading — instantaneous" sub="kW · kVA · PF · Voltage · Frequency · THD" />
              <Arrow />
              <FlowBox tone="border-emerald-500/30 bg-emerald-500/10" title="Current Demand · Power Factor · Power Quality" sub="shown live on the dashboard" />
            </div>
            <div>
              <FlowBox tone="border-blue-500/30 bg-blue-500/10" title="kWh / kVAh register (Final − Initial)" sub="= energy consumed over the period" />
              <Arrow />
              <FlowBox tone="border-blue-500/30 bg-blue-500/10" title="× meter factor → per-feeder MWh" sub="Energy Balance: Grid = Furnaces + Auxiliary" />
              <Arrow />
              <FlowBox tone="border-red-500/30 bg-red-500/10" title="Tariff engine" sub="LF slabs → ToD bands + demand/MMFC + duty" />
              <Arrow />
              <FlowBox tone="border-red-500/30 bg-red-500/10" title="Blended ₹/kWh" sub="→ Energy Cost · Expected Bill · SAP posting" />
            </div>
          </div>
        </div>

        <H>Dashboard cards — the formula behind each</H>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Formula name="Current Demand (MW)" eq="latest kW ÷ 1000" desc={<>The most recent incomer reading. "% of 56 MVA" = latest kVA ÷ contract demand (56,000 kVA).</>} />
          <Formula name="Power Factor" eq="kW ÷ kVA = cos φ" desc={<>Read straight from the meter (SYSTEM_PF). ≥ 0.99 Excellent, ≥ 0.95 Good.</>} />
          <Formula name="Today's Consumption (MWh)" eq="(Final − Initial) kWh ÷ 1000" desc={<>Incomer register delta for the period. "% vs yesterday" compares the <K>same elapsed time</K> for a fair read while today is in progress.</>} />
          <Formula name="Load Factor" eq="kWh ÷ (Peak kW × hours)" desc={<>Average load ÷ peak load (0–1). Near 1 = steady; low = peaky. The bill uses the kVAh/kVA version.</>} />
          <Formula name="Energy Cost (Today)" eq="Σ(cost-centre kWh) × ₹/kWh" desc={<>Each cost centre's daily energy × the blended tariff rate — this is the amount posted to SAP.</>} />
          <Formula name="Expected Monthly Bill" eq="full month-to-date tariff bill" desc={<>The whole MTD TPNODL bill rebuilt on the incomer (energy + ToD + demand + duty + fixed charges).</>} />
        </div>

        <H>Power Quality tile</H>
        <Bullets items={[
          <><K>Voltage (kV)</K> = average line-to-line voltage ÷ 1000.</>,
          <><K>Frequency (Hz)</K> = direct meter reading.</>,
          <><K>THD (V)</K> / <K>THD (I)</K> = average of the three phases (R, Y, B).</>,
          <><K>Current Unbalance (%)</K> = max|phase − average| ÷ average × 100 across R/Y/B.</>,
        ]} />

        <H>The tariff engine (behind Energy Cost &amp; Expected Bill)</H>
        <Steps items={[
          <><K>Base rate</K> — load-factor blend: units up to 60% LF @ <K>₹5.80</K>, the excess above 60% LF @ <K>₹4.70</K>, blended into one ₹/kVAh.</>,
          <><K>ToD bands</K> (baked into the energy charge, no separate line) — Normal @ base, <K>Peak @ base × 1.10</K>, <K>Solar @ base × 0.90</K>.</>,
          <><K>Demand</K> = billable kVA × ₹250, prorated by days · <K>Electricity Duty</K> = 9% · + meter rent &amp; customer-service charge.</>,
        ]} />

        <Note>Every rate and factor (slab rates, ₹250 demand, 9% duty, ToD %, per-meter factors, 56 MVA contract) is a <K>date-effective constant</K> in Settings → Constants — never hard-coded. A tariff change is a new dated row, so past bills still reproduce exactly.</Note>
      </>
    ),
  },
  {
    id: "mapping", title: "Feeder Mapping", icon: <Network size={17} />, go: "mapping",
    body: (
      <>
        <p>Map each physical meter (feeder) → logical load → SAP cost centre. This mapping drives every downstream number.</p>
        <Steps items={[
          <>Pick a feeder row and choose its <K>Load</K> from the dropdown — the SAP <K>Cost Center</K> fills in automatically.</>,
          <>Auto-suggested mappings show <K>Suggested</K> with a confidence %. Click <K>Confirm</K> on a row, or <K>Confirm high-confidence</K> to accept all ≥ 90%.</>,
          <>Use the tabs (<K>All / Unmapped / Unconfirmed / Mapped</K>) and the search box to focus; click a column header to sort.</>,
        ]} />
        <H>Views</H>
        <Bullets items={[
          <><K>SLD Diagram</K> — the single-line hierarchy (default view).</>,
          <><K>Cost Center Map</K> — live load rolled up per cost centre.</>,
          <><K>Table</K> — the mapping grid above.</>,
        ]} />
      </>
    ),
  },
  {
    id: "sld", title: "Single-Line Diagram", icon: <Zap size={17} />, go: "mapping",
    body: (
      <>
        <p>The 132 kV incomer hierarchy with live power flow and transmission loss at every level.</p>
        <Bullets items={[
          <><K>Diagram</K> (interactive) vs <K>Tree</K> (classic org-chart) — toggle top-right.</>,
          <><K>Electrical</K> vs <K>Cost Center</K> — recolour nodes by role or by cost centre.</>,
          <><K>Rotate</K> — flip the diagram between left→right and top→down.</>,
          <><K>Zoom</K> — pinch with two fingers, ctrl + scroll, or the +/− buttons; <K>Fullscreen</K> to expand; <K>Expand/Collapse all</K> for depth.</>,
          <>Each node shows its load (kW/MW) and loss (kW and %).</>,
        ]} />
      </>
    ),
  },
  {
    id: "accounting", title: "Energy Accounting", icon: <Calculator size={17} />, go: "accounting",
    body: (
      <>
        <p>Monthly energy balance <K>Grid = Furnaces + Auxiliary</K>, costed at the blended tariff.</p>
        <H>How energy is measured</H>
        <Bullets items={[
          <>Energy comes from each meter's <K>kWh register</K> (Final − Initial), grossed by that meter's <K>multiplication factor</K> — <K>per-meter</K> (e.g. Furnace-1 ×1.0097, Furnace-2 ×1.012), falling back to the global ×1.01. Set these in Settings → Constants → Per-Meter Multiplication Factors. Readings ≤ 100 (meter offline) are skipped.</>,
          <>The month follows the <K>header date picker</K>. Toggle the energy balance between <K>Bars</K> and <K>Flow</K> (sankey), and between <K>MWh</K> (active) and <K>MVAh</K> (apparent) energy; zoom / fullscreen it.</>,
        ]} />
        <H>Tariff & Bill Working</H>
        <Bullets items={[
          <><K>FTD / MTD / YTD</K> cards show the per-unit ₹/kWh.</>,
          <>Click <K>Bill Working</K> for the full line-item sheet — inputs (kVAh, MD, load factor), every charge, and the total — for FTD/MTD/YTD, with <K>Max Demand reached</K> (value + time), the ToD split, a <K>kVAh ↔ MVAh</K> unit toggle, and CSV export.</>,
          <>The <K>download icon</K> exports the month's MIS workbook. The cost-centre ledger shows energy, rate, cost and % share.</>,
        ]} />
      </>
    ),
  },
  {
    id: "settings", title: "System Settings", icon: <Settings size={17} />, go: "settings",
    body: (
      <>
        <p>Four tabs: <K>SAP Connection</K>, <K>Constants &amp; Factors</K>, <K>System Configuration</K> and <K>Change Log</K>.</p>
        <H>SAP Connection</H>
        <Steps items={[
          <>Enter the <K>OData Base URL</K>, <K>Service</K>, <K>SAP Client</K> (e.g. 100), <K>Username</K> and <K>Password</K> (stored encrypted; never shown again).</>,
          <>Click <K>Test connection</K> — you should see <K>Connected</K>. Leave <K>Verify SSL</K> off for on-prem self-signed certificates.</>,
          <>Under <K>Cost Centers to Post</K>, choose <K>All</K> or select specific ones — saved so you don't reselect each time.</>,
          <><K>Save configuration</K>.</>,
        ]} />
        <H>Constants &amp; Factors</H>
        <Bullets items={[
          <>Every tariff constant the engines use lives here — <K>meter multiplication factor</K> (global + <K>per-meter overrides</K>), <K>contract demand</K>, <K>MMFC floor</K>, <K>ToD windows &amp; percentages</K>, and the full <K>regulated tariff</K> (slab rates, demand charge, duty). Nothing is hard-coded.</>,
          <><K>Date-effective.</K> Each value applies from its effective date forward. To change one, click <K>New value</K>, enter the number and the date it takes effect, and save — the old value stays in force for dates before it, so past bills reproduce exactly.</>,
          <>Expand <K>versions</K> to see the full history of any factor; the current one is tagged <K>in force</K>.</>,
          <>For the tariff, <K>Edit</K> corrects the current version, or <K>New version</K> schedules a change from a future date (e.g. a new OERC order).</>,
        ]} />
        <H>System Configuration</H>
        <Bullets items={[
          <>Structural identifiers — the <K>main 132 kV incomer</K> meter, grid meter factor, and the client / plant IDs. Editable ones apply on the <K>next backend restart</K>; the greyed IDs are deployment-level (they decide the source tables) and shown for reference.</>,
        ]} />
        <H>Change Log</H>
        <Bullets items={[
          <>Every edit to a constant, tariff, or system value is recorded — <K>what changed, when, its effective date, and who made it</K> — so configuration history is fully auditable.</>,
        ]} />
      </>
    ),
  },
  {
    id: "sap", title: "SAP Posting", icon: <Database size={17} />, go: "sap",
    body: (
      <>
        <p>Post daily per-cost-centre energy cost to SAP — one document per day.</p>
        <Steps items={[
          <>The period follows the header date picker. A <K>single day</K> shows its cost-centre detail; a <K>range</K> shows a per-day breakdown.</>,
          <>The <K>rate</K> defaults to the computed tariff; edit it (manual override) or <K>Reset to computed</K>.</>,
          <>Click <K>Stage</K> to queue the rows (status → pending), then <K>Post to SAP</K> to transmit.</>,
          <>Re-running is safe: already-posted rows are skipped. Tick <K>Re-post</K> to overwrite them intentionally.</>,
        ]} />
        <Bullets items={[
          <><K>Posting History</K> records each day's rows, amount, posted/pending/failed, and <K>who posted &amp; when</K>.</>,
          <>If credentials aren't set, a banner links you to System Settings; rows stay staged until configured.</>,
        ]} />
      </>
    ),
  },
  {
    id: "bill", title: "Bill Intelligence", icon: <FileText size={17} />, go: "recon",
    body: (
      <>
        <p>Rebuilds the TPNODL bill from meter data using the <K>same tariff engine</K> as Bill Working, then reconciles it against the actual utility bill line-by-line.</p>
        <Bullets items={[
          <>The <K>Computed</K> side is the full engine bill (energy slabs, ToD, demand/MMFC, overdrawal, LF rebate, duty, fixed charges).</>,
          <>Click <K>Enter actual bill</K> and type the TPNODL figures (energy, ToD, demand, PF penalty, duty, DPS, net payable). It's saved per month.</>,
          <>Each row shows <K>Computed vs Actual, variance ₹ and %</K>, colour-coded; the header shows a <K>Matched</K> (within ±2%) or <K>Review</K> status. Power-factor penalty and DPS aren't modelled by the engine, so they surface as actual-only lines.</>,
        ]} />
      </>
    ),
  },
  {
    id: "concepts", title: "Key Concepts", icon: <Gauge size={17} />,
    body: (
      <>
        <Bullets items={[
          <><K>Load Factor</K> — kWh ÷ (Max Demand × hours); higher LF earns cheaper slab energy and a rebate.</>,
          <><K>Max Demand (MD)</K> — the highest 15-min block kVA in the month; drives the demand/MMFC charge.</>,
          <><K>Billable Demand</K> — max(MD, 80% of Contract Demand).</>,
          <><K>ToD (Time of Day)</K> — the energy rate shifts by time of day: <K>Solar</K> (08–16 h, <K>−10%</K> of the rate), <K>Peak</K> (18–24 h, <K>+10%</K>), and <K>Normal</K> (all other hours, the base rate). It's baked into the energy charge as three bands — no separate line. Windows and percentages are editable in Settings → Constants → Time of Day.</>,
          <><K>Blended rate</K> — total incomer bill ÷ kWh; applied to each cost centre's consumption for costing and SAP posting.</>,
          <><K>Power Factor</K> — kW ÷ kVA (cos φ), read live from the incomer meter; ≥ 0.99 is excellent.</>,
        ]} />
        <Note>Numbers can differ from the Energy Master by ~1% when <K>em_valuedata</K> has gaps for a meter/month. If a month looks low, its raw data may need re-importing (<K>backfill_15min</K>).</Note>
      </>
    ),
  },
];

// Typed API client for the PEMS backend.

export interface Summary {
  total_meters: number;
  enabled_meters: number;
  mapped_meters: number;
  unmapped_meters: number;
  confirmed_mappings: number;
  unconfirmed_mappings: number;
  total_loads: number;
  mapped_loads: number;
  unmapped_loads: number;
}

export interface Load {
  id: number;
  load_code: string;
  load_name: string;
  sap_costcenter: string | null;
  costcenter_desc: string | null;
  section: string | null;
  load_type: string;
  is_derived: number;
}

export interface MeterMapping {
  map_id: number;
  load_id: number;
  load_code: string;
  load_name: string;
  sap_costcenter: string | null;
  costcenter_desc: string | null;
  sign: number;
  is_confirmed: number;
  match_score: number | null;
  notes: string | null;
}

export interface Meter {
  device_id: string;
  feeder_id: number;
  feeder_name: string;
  feeder_location: string | null;
  device_name: string | null;
  section: string | null;
  role: string;
  is_incomer: number;
  is_enabled: number;
  is_virtual: number;
  mappings: MeterMapping[];
  is_mapped: boolean;
  is_confirmed: boolean;
}

export interface Executive {
  as_of: string | null;
  date?: string;
  range?: { start: string; end: string };
  live?: boolean;
  is_range?: boolean;
  demand: { kw: number; mw: number; kva: number; contract_kva: number; utilization_pct: number };
  power_factor: number | null;
  consumption: { today_mwh: number | null; yesterday_mwh: number | null; change_pct: number | null };
  load_factor: number | null;
  plant_load: {
    grid_mw: number; furnace_mw: number; auxiliary_mw: number; gcp_mw: number;
    briquetting_mw: number; utility_mw: number; furnace_pct: number; auxiliary_pct: number;
  };
  demand_trend: { hour: string; today_mw: number | null; yesterday_mw: number | null }[];
  tod_breakup: { solar_mwh: number; normal_mwh: number; peak_mwh: number; total_mwh: number };
  top_feeders: { device_id: string; feeder_id: number; name: string; section: string; avg_mw: number }[];
  power_quality: {
    power_factor: number | null; voltage_kv: number | null; frequency: number | null;
    thd_v: number | null; thd_i: number | null; unbalance_pct: number | null;
  };
  status: {
    last_update: string; rtus_online: number; rtus_total: number | null;
    feeders_online: number; feeders_total: number; data_points_today: number; healthy: boolean | null;
  };
}

export interface TreeFeeder {
  device_id: string; feeder_id: number; feeder_name: string; role: string;
  section: string | null; coefficient: number; is_confirmed: boolean; kw: number;
}
export interface TreeLoad {
  load_code: string; load_name: string; load_type: string; feeders: TreeFeeder[];
  feeder_count: number; kw: number;
}
export interface TreeCostCenter {
  sap_costcenter: string; description: string | null; loads: TreeLoad[];
  feeder_count: number; kw: number;
}
export interface MappingTree {
  as_of: string | null;
  cost_centers: TreeCostCenter[];
  structural: TreeLoad[];
  unmapped: TreeFeeder[];
}

export interface SldNode {
  device_id: string; feeder_id: number; feeder_name: string; role: string;
  sld_costcenter: string | null; costcenter_desc: string | null;
  kw: number; subtree_kw: number; descendants: number;
  children_kw: number | null; loss_kw: number | null; loss_pct: number | null;
  children: SldNode[];
}
export interface SldTotals {
  incoming_kw: number; transmitted_kw: number; loss_kw: number; loss_pct: number;
  feeders: number; panels: number; equipment: number;
}
export interface SldTree {
  as_of: string | null; roots: SldNode[]; unlinked: SldNode[];
  total_feeders: number; totals: SldTotals;
}

export interface BalanceLoad {
  load_code: string; load_name: string; sap_costcenter: string | null;
  costcenter_desc: string | null; mwh: number; mvah: number; confirmed: boolean;
  no_data?: boolean;   // mapped meter(s) had no rollup data for the period
}
export interface Balance {
  month: string;
  period: { start: string; end: string; hours: number; complete: boolean };
  grid_mwh: number; furnace_total_mwh: number; auxiliary_mwh: number;
  grid_mvah: number; furnace_total_mvah: number; auxiliary_mvah: number;
  furnaces: BalanceLoad[]; individual_loads: BalanceLoad[];
  miscellaneous_mwh: number; miscellaneous_mvah: number;
  cost_centers: { sap_costcenter: string | null; description: string | null; mwh: number }[];
  method: string;
  error?: string;
}

export interface SapRow {
  posting_date: string; sap_costcenter: string; costcenter_desc: string;
  consumption: number; unit_rate: number | null; amount: number | null;
  status: string; sap_doc_no?: string | null;
}
export interface SapPreview {
  posting_date: string; unit_rate: number; rate_source?: string;
  total_consumption: number; total_amount: number;
  rows: SapRow[]; source: string;
}
export interface SapConfig {
  user: string; odata_base: string; odata_service: string; client: string; verify_ssl: boolean;
  has_password: boolean; costcenters: string[]; configured: boolean;
}
export interface SapCostCenter { sap_costcenter: string; description: string; category: string | null; }
export interface SapHistoryDay {
  posting_date: string; rows_ct: number; total_amount: number | null; total_kwh: number | null;
  posted: number; pending: number; failed: number; confirmed: number;
  last_posted: string | null; posted_by: string | null;
}
export interface SapDaySummary {
  posting_date: string; rows_ct: number; total_kwh: number; total_amount: number;
  unit_rate: number; rate_source: string;
}
export interface SapPreviewRange {
  start: string; end: string; days: SapDaySummary[]; total_amount: number; total_kwh: number;
}

export interface ReconComponent {
  component: string; computed: number; actual: number | null;
  variance: number | null; variance_pct: number | null; note?: string | null;
}
export interface Recon {
  month: string;
  has_actual: boolean;
  status: "matched" | "review" | null;
  inputs: Record<string, number | string | boolean | null>;
  components: ReconComponent[];
  computed_total: number; actual_total: number | null;
  total_variance: number | null; total_variance_pct: number | null;
  note: string;
}
export interface ActualBill {
  bill_month?: string; consumer_ac?: string | null; bill_no?: string | null;
  contract_demand_kva?: number | null; billable_demand_kva?: number | null;
  power_factor?: number | null; load_factor_pct?: number | null;
  kwh_total?: number | null; kvah_total?: number | null;
  energy_charge?: number | null; demand_charge?: number | null; tod_charge?: number | null;
  pf_charge?: number | null; electricity_duty?: number | null; dps?: number | null;
  net_payable?: number | null;
}

export interface ConstantRow {
  id: number; ckey: string; label: string; category: string; unit: string | null;
  cvalue: number; effective_from: string; note: string | null;
  updated_by: string | null; updated_at: string | null;
}
export interface TariffRow {
  id: number; name: string; tariff_order_ref: string | null; voltage_class: string;
  consumer_category: string | null; effective_from: string; effective_to: string | null;
  status: string; slab_lf_low_rate: number; slab_lf_high_rate: number; lf_threshold_pct: number;
  demand_charge: number; electricity_duty_pct: number; meter_rent: number;
  customer_service_charge: number; colony_rate: number | null; notes: string | null;
  updated_at: string | null;
}

export interface SystemConfigRow {
  cfg_key: string; cfg_value: string | null; data_type: string;
  label: string; editable: boolean; kind: string; note?: string;
}
export interface AuditRow {
  id: number; entity: string; entity_key: string; action: string;
  detail: string | null; effective_from: string | null;
  changed_by: string | null; changed_at: string | null;
}

export interface MeterFactorVersion {
  mult_factor: number; effective_from: string; note: string | null;
  updated_by: string | null; updated_at: string | null;
}
export interface MeterFactorMeter {
  device_id: string; feeder_id: number; feeder_name: string | null;
  versions: MeterFactorVersion[];   // newest effective_from first
}
export interface MeterFactors { default: number; meters: MeterFactorMeter[]; }

export interface FyMonth {
  month: string; fy: string; total: number; kwh: number;
  per_unit_rate: number; load_factor_pct: number; power_factor: number;
}
export interface FyMonths {
  start: string; end: string; months: FyMonth[]; fys: string[];
  total: number; kwh: number; per_unit_rate: number;
}

export interface RateResult {
  level: string; date: string; md_at?: string | null;
  kwh: number; kvah: number; md_kva: number; billable_kva: number; contract_kva: number;
  solar_kvah?: number; normal_kvah?: number; peak_kvah?: number;
  load_factor_pct: number; days_in_month: number; days_elapsed: number;
  components: {
    energy: number; tod_surcharge: number; tod_incentive: number; demand: number;
    overdrawal: number; lf_rebate: number; electricity_duty: number;
    meter_rent: number; customer_service_charge: number;
  };
  energy_slabs?: {
    threshold_pct: number;
    s1_kvah: number; s1_rate: number; s1_amount: number;
    s2_kvah: number; s2_rate: number; s2_amount: number;
  };
  total: number; per_unit_rate: number;
  months?: { month: string; total: number; kwh: number; per_unit_rate: number }[];
}

export interface Alert {
  id: string; severity: "critical" | "warning" | "info";
  source: string; title: string; message: string;
}
export interface AlertsResult {
  count: number; critical: number; warning: number; info: number;
  as_of: string | null; alerts: Alert[];
}

export interface AuthUser {
  emp_id: string; name: string; title?: string | null; role?: string | null;
  department?: string | null; email?: string | null; location?: string | null; plant?: string | null;
  pems_role?: "admin" | "manager" | "viewer";   // access role within PEMS
}
export interface RoleRow {
  emp_id: string; role: "admin" | "manager" | "viewer"; name: string;
  designation?: string | null; department?: string | null;
  granted_by?: string | null; updated_at?: string | null;
}
export interface EmployeeHit { emp_id: string; name: string; designation?: string | null; department?: string | null; }

const API = "/api";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  executive: (start?: string, end?: string) =>
    fetch(`${API}/dashboard/executive${start ? `?start=${start}&end=${end ?? start}` : ""}`).then(j<Executive>),
  tree: () => fetch(`${API}/mapping/tree`).then(j<MappingTree>),
  sld: () => fetch(`${API}/mapping/sld`).then(j<SldTree>),
  summary: () => fetch(`${API}/mapping/summary`).then(j<Summary>),
  loads: () => fetch(`${API}/mapping/loads`).then(j<Load[]>),
  meters: (params: { only?: string; section?: string; search?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][],
    ).toString();
    return fetch(`${API}/mapping/meters${qs ? `?${qs}` : ""}`).then(j<Meter[]>);
  },
  upsert: (body: { load_id: number; device_id: string; feeder_id: number; sign?: number }) =>
    fetch(`${API}/mapping/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ id: number; action: string }>),
  confirm: (mapId: number) =>
    fetch(`${API}/mapping/${mapId}/confirm`, { method: "POST" }).then(j),
  confirmAll: (minScore: number) =>
    fetch(`${API}/mapping/confirm-all?min_score=${minScore}`, { method: "POST" }).then(
      j<{ confirmed: number }>,
    ),
  remove: (mapId: number) =>
    fetch(`${API}/mapping/${mapId}`, { method: "DELETE" }).then(j),

  // accounting
  accountingMonths: () => fetch(`${API}/accounting/months`).then(j<string[]>),
  balance: (month: string) => fetch(`${API}/accounting/balance?month=${month}`).then(j<Balance>),
  reportXlsxUrl: (month: string) => `${API}/accounting/report.xlsx?month=${month}`,

  // sap posting
  sapPreview: (date: string, rate?: number) =>
    fetch(`${API}/sap/preview?posting_date=${date}${rate != null ? `&unit_rate=${rate}` : ""}`).then(j<SapPreview>),
  sapStatus: (date: string) => fetch(`${API}/sap/status?posting_date=${date}`).then(j<SapRow[]>),
  sapStage: (date: string, rate?: number) =>
    fetch(`${API}/sap/stage?posting_date=${date}${rate != null ? `&unit_rate=${rate}` : ""}`, { method: "POST" })
      .then(j<{ posting_date: string; staged: number }>),
  sapPost: (date: string, by?: string, force?: boolean) =>
    fetch(`${API}/sap/post?posting_date=${date}${by ? `&by=${encodeURIComponent(by)}` : ""}${force ? "&force=true" : ""}`, { method: "POST" })
      .then(j<{ ok: boolean; posted: number; failed?: number; skipped?: number; reason?: string }>),
  sapPreviewRange: (start: string, end: string, rate?: number) =>
    fetch(`${API}/sap/preview_range?start=${start}&end=${end}${rate != null ? `&unit_rate=${rate}` : ""}`).then(j<SapPreviewRange>),
  sapStageRange: (start: string, end: string, rate?: number) =>
    fetch(`${API}/sap/stage_range?start=${start}&end=${end}${rate != null ? `&unit_rate=${rate}` : ""}`, { method: "POST" })
      .then(j<{ staged: number; days: number }>),
  sapPostRange: (start: string, end: string, by?: string, force?: boolean) =>
    fetch(`${API}/sap/post_range?start=${start}&end=${end}${by ? `&by=${encodeURIComponent(by)}` : ""}${force ? "&force=true" : ""}`, { method: "POST" })
      .then(j<{ ok: boolean; posted: number; failed?: number; skipped?: number; reason?: string }>),
  sapConfig: () => fetch(`${API}/sap/config`).then(j<SapConfig>),
  sapSaveConfig: (body: Partial<SapConfig> & { password?: string }) =>
    fetch(`${API}/sap/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(j<SapConfig>),
  sapTestConnection: (body: Partial<SapConfig> & { password?: string }) =>
    fetch(`${API}/sap/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(j<{ ok: boolean; status?: number; message: string }>),
  sapCostcenters: () => fetch(`${API}/sap/costcenters`).then(j<SapCostCenter[]>),
  sapHistory: (limit = 90) => fetch(`${API}/sap/history?limit=${limit}`).then(j<SapHistoryDay[]>),

  // reconciliation
  recon: (month: string) => fetch(`${API}/recon/compute?month=${month}`).then(j<Recon>),
  reconActual: (month: string) => fetch(`${API}/recon/actual?month=${month}`).then(j<ActualBill | null>),
  saveReconActual: (month: string, body: ActualBill) =>
    fetch(`${API}/recon/actual?month=${month}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<Recon>),

  // auth + activity tracking (intranet SSO)
  alerts: () => fetch(`${API}/alerts`).then(j<AlertsResult>),
  roles: () => fetch(`${API}/roles`).then(j<RoleRow[]>),
  searchEmployees: (q: string) => fetch(`${API}/roles/employees?q=${encodeURIComponent(q)}`).then(j<EmployeeHit[]>),
  setRole: (emp_id: string, role: string) =>
    fetch(`${API}/roles`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emp_id, role }) }).then(j<RoleRow[]>),
  deleteRole: (emp_id: string) => fetch(`${API}/roles/${emp_id}`, { method: "DELETE" }).then(j<RoleRow[]>),
  me: () => fetch(`${API}/auth/me`).then(j<{ user: AuthUser }>),
  login: (empid: string, password: string) =>
    fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empid, password }) }).then(j<{ user: AuthUser }>),
  logout: () => fetch(`${API}/auth/logout`, { method: "POST" }).then(j<{ ok: boolean }>),
  track: (path: string, referrer?: string) =>
    fetch(`${API}/auth/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, referrer }) }).catch(() => {}),
  heartbeat: () => fetch(`${API}/auth/heartbeat`, { method: "POST" }).catch(() => {}),

  // rate engine
  rateAll: (day: string) => fetch(`${API}/rate/all?day=${day}`).then(j<{ ftd: RateResult; mtd: RateResult; ytd: RateResult }>),
  fyMonths: (start: string, end: string) => fetch(`${API}/rate/fy-months?start=${start}&end=${end}`).then(j<FyMonths>),

  // settings — date-effective constants & tariff versions
  constants: () => fetch(`${API}/settings/constants`).then(j<ConstantRow[]>),
  saveConstant: (body: Partial<ConstantRow> & { ckey: string; label: string; cvalue: number; effective_from: string }) =>
    fetch(`${API}/settings/constants`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<ConstantRow[]>),
  deleteConstant: (id: number, by?: string) => fetch(`${API}/settings/constants/${id}${by ? `?by=${encodeURIComponent(by)}` : ""}`, { method: "DELETE" }).then(j<ConstantRow[]>),
  tariffs: () => fetch(`${API}/settings/tariffs`).then(j<TariffRow[]>),
  saveTariff: (body: Partial<TariffRow> & { updated_by?: string }) =>
    fetch(`${API}/settings/tariffs`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<TariffRow[]>),
  systemConfig: () => fetch(`${API}/settings/system`).then(j<SystemConfigRow[]>),
  saveSystemConfig: (cfg_key: string, cfg_value: unknown, updated_by?: string) =>
    fetch(`${API}/settings/system`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cfg_key, cfg_value, updated_by }) }).then(j<SystemConfigRow[]>),
  audit: (limit = 100) => fetch(`${API}/settings/audit?limit=${limit}`).then(j<AuditRow[]>),
  meterFactors: () => fetch(`${API}/settings/meter-factors`).then(j<MeterFactors>),
  saveMeterFactor: (body: { device_id: string; feeder_id: number; mult_factor: number; effective_from: string; note?: string; updated_by?: string }) =>
    fetch(`${API}/settings/meter-factors`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j<MeterFactors>),
  deleteMeterFactor: (device_id: string, feeder_id: number, effective_from: string, by?: string) =>
    fetch(`${API}/settings/meter-factors/${device_id}/${feeder_id}?effective_from=${effective_from}${by ? `&by=${encodeURIComponent(by)}` : ""}`, { method: "DELETE" }).then(j<MeterFactors>),
};

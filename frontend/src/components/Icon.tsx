// Minimal stroke-based icon set (18px default). Keeps the bundle lean and the look consistent.
import type { ReactElement } from "react";
type Props = { name: IconName; size?: number; className?: string };
export type IconName =
  | "dashboard" | "monitor" | "accounting" | "sap" | "bill" | "schedule"
  | "market" | "procurement" | "ai" | "alert" | "reports" | "masterdata"
  | "users" | "settings" | "audit" | "search" | "bell" | "expand" | "sun" | "moon"
  | "export" | "bolt" | "gauge" | "pf" | "rupee" | "grid" | "furnace" | "chevron" | "check";

const P: Record<IconName, ReactElement> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  monitor: <><path d="M3 12h4l3 8 4-16 3 8h4" /></>,
  accounting: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  sap: <><path d="M4 7c0-1.5 3.6-3 8-3s8 1.5 8 3-3.6 3-8 3-8-1.5-8-3Z" /><path d="M4 7v10c0 1.5 3.6 3 8 3s8-1.5 8-3V7" /><path d="M4 12c0 1.5 3.6 3 8 3s8-1.5 8-3" /></>,
  bill: <><path d="M6 2h9l4 4v16l-3-2-3 2-3-2-3 2V2Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  schedule: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  market: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  procurement: <><circle cx="9" cy="20" r="1.6" /><circle cx="18" cy="20" r="1.6" /><path d="M2 3h3l2.6 12.6a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L21 7H6" /></>,
  ai: <><rect x="5" y="6" width="14" height="12" rx="3" /><path d="M12 3v3M9 11h.01M15 11h.01M9 15h6" /></>,
  alert: <><path d="M12 3l9 16H3L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  reports: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 13v4M12 9v8M16 11v6" /></>,
  masterdata: <><path d="M4 7c0-1.5 3.6-3 8-3s8 1.5 8 3-3.6 3-8 3-8-1.5-8-3Z" /><path d="M4 7v10c0 1.5 3.6 3 8 3s8-1.5 8-3V7" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 4a3 3 0 0 1 0 6M22 20c0-2.6-1.6-4.2-4-4.7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  audit: <><path d="M9 3h6l1 3H8l1-3Z" /><rect x="4" y="6" width="16" height="15" rx="2" /><path d="M9 12l2 2 4-4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  expand: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  moon: <><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" /></>,
  export: <><path d="M12 3v12M8 7l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  bolt: <><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8Z" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-5" /></>,
  pf: <><path d="M3 12a9 9 0 0 1 18 0" /><path d="M3 12c4 0 4 6 8 6s4-6 8-6" /></>,
  rupee: <><path d="M7 4h10M7 8h10M7 4c5 0 7 1 7 4s-2 4-7 4l7 8" /></>,
  grid: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" /></>,
  furnace: <><path d="M6 3h12v6l-2 2v10H8V11L6 9V3Z" /><path d="M10 21v-4h4v4" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
};

export default function Icon({ name, size = 18, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {P[name]}
    </svg>
  );
}

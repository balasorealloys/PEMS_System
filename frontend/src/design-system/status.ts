// Semantic status → colour/label mappings used across feeder roles, postings, health.
import { semantic, brand, accent, slate } from "./colors";

export const roleColor: Record<string, string> = {
  grid: brand.DEFAULT, furnace: semantic.danger, incomer: accent.purple,
  aux: semantic.success, unknown: slate[500],
};

export const postingStatus: Record<string, { label: string; tone: Tone }> = {
  preview: { label: "Preview", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  posted: { label: "Posted", tone: "success" },
  confirmed: { label: "Confirmed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export const toneColor: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: semantic.success, bg: "rgba(16,185,129,0.14)" },
  warning: { fg: semantic.warning, bg: "rgba(245,158,11,0.14)" },
  danger: { fg: semantic.danger, bg: "rgba(239,68,68,0.14)" },
  info: { fg: semantic.info, bg: "rgba(59,130,246,0.14)" },
  neutral: { fg: slate[500], bg: "rgba(100,116,139,0.14)" },
};

export function healthTone(pct: number): Tone {
  return pct >= 95 ? "success" : pct >= 85 ? "warning" : "danger";
}

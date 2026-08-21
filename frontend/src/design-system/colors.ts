// Colour tokens — single source of truth (premium palette).
export const slate = {
  50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8",
  500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A", 950: "#020617",
} as const;

export const brand = {
  DEFAULT: "#2563EB", dark: "#1D4ED8", light: "#EFF6FF", subtle: "#DBEAFE",
} as const;

export const accent = {
  purple: "#7C3AED", cyan: "#06B6D4", pink: "#EC4899", amber: "#F59E0B", emerald: "#10B981",
} as const;

export const semantic = {
  success: "#10B981", successLight: "#D1FAE5",
  warning: "#F59E0B", warningLight: "#FEF3C7",
  danger: "#EF4444", dangerLight: "#FEE2E2",
  info: "#3B82F6", infoLight: "#DBEAFE",
} as const;

export const gradients = {
  primary: "linear-gradient(135deg,#2563EB 0%,#7C3AED 100%)",
  accent: "linear-gradient(135deg,#06B6D4 0%,#2563EB 50%,#7C3AED 100%)",
  success: "linear-gradient(135deg,#10B981 0%,#06B6D4 100%)",
  danger: "linear-gradient(135deg,#EF4444 0%,#EC4899 100%)",
  warm: "linear-gradient(135deg,#F59E0B 0%,#EC4899 100%)",
} as const;

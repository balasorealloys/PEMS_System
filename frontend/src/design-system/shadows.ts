// Layered shadows (visible in light mode) + coloured glows for premium depth.
export const shadows = {
  xs: "0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)",
  sm: "0 2px 6px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.05)",
  md: "0 4px 12px -2px rgba(0,0,0,0.10),0 2px 6px -2px rgba(0,0,0,0.06)",
  lg: "0 12px 24px -4px rgba(0,0,0,0.12),0 4px 8px -4px rgba(0,0,0,0.06)",
  xl: "0 20px 40px -8px rgba(0,0,0,0.14),0 8px 16px -6px rgba(0,0,0,0.06)",
  card: "0 2px 8px rgba(0,0,0,0.07),0 1px 4px rgba(0,0,0,0.04)",
  cardHover: "0 16px 36px -6px rgba(0,0,0,0.14),0 6px 16px -4px rgba(37,99,235,0.10)",
  glow: "0 0 24px rgba(37,99,235,0.20)",
  primary: "0 4px 20px rgba(37,99,235,0.30)",
  success: "0 4px 20px rgba(16,185,129,0.30)",
  danger: "0 4px 20px rgba(239,68,68,0.30)",
} as const;

// darker theme variants (softer, no colored bleed on near-black bg)
export const shadowsDark = {
  card: "0 3px 10px rgba(0,0,0,0.30)",
  cardHover: "0 16px 40px rgba(0,0,0,0.45)",
} as const;

// Categorical chart palette + axis/grid colours per theme.
export const chartPalette = [
  "#2563EB", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899", "#0EA5E9",
] as const;

export const chartPaletteDark = [
  "#60A5FA", "#A78BFA", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#F472B6", "#38BDF8",
] as const;

export const chartAxis = {
  light: { grid: "#E2E8F0", axis: "#94A3B8", text: "#64748B", tooltipBg: "#FFFFFF", tooltipBorder: "#E2E8F0" },
  dark: { grid: "#232C42", axis: "#3B4667", text: "#8B95A9", tooltipBg: "#0E1320", tooltipBorder: "#232C42" },
} as const;

export const palette = (mode: "light" | "dark") => (mode === "dark" ? chartPaletteDark : chartPalette);
export const axisColors = (mode: "light" | "dark") => chartAxis[mode];

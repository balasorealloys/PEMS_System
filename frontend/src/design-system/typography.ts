export const fonts = {
  sans: '"Inter","DM Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',
  mono: '"JetBrains Mono",ui-monospace,"Consolas",monospace',
  display: '"Inter","DM Sans",ui-sans-serif,system-ui,sans-serif',
} as const;

export const fontSize = {
  xs: "11px", sm: "12.5px", base: "13.5px", md: "15px", lg: "18px",
  xl: "22px", "2xl": "28px", "3xl": "34px", "4xl": "42px",
} as const;

export const fontWeight = { normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 } as const;

export const tracking = { tight: "-0.025em", snug: "-0.015em", body: "-0.011em", normal: "0", wide: "0.04em" } as const;

// numeric cells: tabular, aligned figures
export const numeric = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' } as const;

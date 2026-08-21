// Assembles light/dark themes from the tokens and bridges them to CSS variables
// (so both the JS components and the existing CSS read one source of truth).
import { slate, brand, semantic } from "./colors";
import { shadows, shadowsDark } from "./shadows";

export type ThemeMode = "light" | "dark";
export interface Theme {
  bg: string; bg2: string; panel: string; panel2: string; border: string;
  text: string; text2: string; muted: string; primary: string;
  shadowCard: string; shadowHover: string;
}

export const lightTheme: Theme = {
  bg: slate[50], bg2: "#E7EBF2", panel: "#FFFFFF", panel2: "#F7F9FC",
  border: "#DDE3EC", text: "#16202F", text2: "#46536A", muted: "#7A8699",
  primary: brand.DEFAULT, shadowCard: shadows.card, shadowHover: shadows.cardHover,
};

export const darkTheme: Theme = {
  bg: "#0A0E18", bg2: "#0E1320", panel: "#121829", panel2: "#161D31",
  border: "#232C42", text: "#E7ECF6", text2: "#AAB4C8", muted: "#6F7A92",
  primary: "#4F7CFF", shadowCard: shadowsDark.card, shadowHover: shadowsDark.cardHover,
};

export const themes: Record<ThemeMode, Theme> = { light: lightTheme, dark: darkTheme };

export const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
export const currentMode = (): ThemeMode => (isDark() ? "dark" : "light");

// re-export the semantic map for convenience
export { semantic };

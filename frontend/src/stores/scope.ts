// Global "scope" the whole app reads from: the active date range and plant.
// Driven by the header (date-range picker + plant selector), consumed by pages.
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlantKey = "all" | "balasore" | "jajpur";

export interface DateRange {
  /** inclusive start, ISO yyyy-mm-dd */
  start: string;
  /** inclusive end, ISO yyyy-mm-dd */
  end: string;
  /** label of the preset that produced this range, or "Custom" */
  preset: string;
}

interface ScopeState {
  range: DateRange;
  plant: PlantKey;
  /** current user — placeholder until a login/user system exists */
  user: string;
  setRange: (r: DateRange) => void;
  setPlant: (p: PlantKey) => void;
}

const iso = (d: Date) => {
  // local-date ISO (no timezone shift) — the plant runs on IST wall-clock
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function defaultRange(): DateRange {
  const now = new Date();
  return { start: iso(now), end: iso(now), preset: "Today" };
}

export const useScope = create<ScopeState>()(
  persist(
    (set) => ({
      range: defaultRange(),
      plant: "all",
      user: "Akash Yadav",
      setRange: (range) => set({ range }),
      setPlant: (plant) => set({ plant }),
    }),
    {
      name: "pems.scope",
      // `range` is deliberately NOT persisted: every fresh load of the app should
      // default to today's data. Only picking a different range within a session
      // should show a different date — reopening/reloading the app resets to "Today".
      partialize: (s) => ({ plant: s.plant, user: s.user }),
    },
  ),
);

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// local-date ISO (no timezone shift) — matches stores/scope.ts's iso()
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Centralised TanStack Query hooks over the typed API client.
// `start`/`end` follow the header date-range picker. Auto-refresh only while the
// scope's end is today or later — a fully historical range/day is static.
export const useExecutive = (start?: string, end?: string) =>
  useQuery({
    queryKey: ["executive", start ?? "live", end ?? "live"],
    queryFn: () => api.executive(start, end),
    refetchInterval: end && end < todayIso() ? false : 30_000,
  });

export const useAlerts = () =>
  useQuery({ queryKey: ["alerts"], queryFn: api.alerts, refetchInterval: 60_000, staleTime: 30_000 });

export const useMappingSummary = () =>
  useQuery({ queryKey: ["mapping", "summary"], queryFn: api.summary });

export const useSldTree = () =>
  useQuery({ queryKey: ["mapping", "sld"], queryFn: api.sld });

export const useMappingTree = () =>
  useQuery({ queryKey: ["mapping", "tree"], queryFn: api.tree });

export const useAccountingMonths = () =>
  useQuery({ queryKey: ["accounting", "months"], queryFn: api.accountingMonths });

export const useBalance = (month: string) =>
  useQuery({ queryKey: ["accounting", "balance", month], queryFn: () => api.balance(month), enabled: !!month });

export const useRateAll = (day: string) =>
  useQuery({ queryKey: ["rate", "all", day], queryFn: () => api.rateAll(day), enabled: !!day });

export const useRecon = (month: string) =>
  useQuery({ queryKey: ["recon", month], queryFn: () => api.recon(month), enabled: !!month });

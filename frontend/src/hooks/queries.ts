import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// Centralised TanStack Query hooks over the typed API client.
export const useExecutive = () =>
  useQuery({ queryKey: ["executive"], queryFn: api.executive, refetchInterval: 30_000 });

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

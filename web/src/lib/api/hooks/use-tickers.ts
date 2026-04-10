"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut, apiDelete } from "../client";
import type { TickerMapping } from "@/lib/types";

export function useTickerMappings() {
  return useQuery<TickerMapping[]>({
    queryKey: ["tickers"],
    queryFn: () => apiGet<TickerMapping[]>("/api/tickers"),
  });
}

export function useUpsertTicker() {
  return useMutation<TickerMapping, Error, { ticker: string; category: string }>({
    mutationFn: async ({ ticker, category }) => {
      return apiPut<TickerMapping>(`/api/tickers/${ticker}`, { category });
    },
  });
}

export function useDeleteTicker() {
  return useMutation<void, Error, string>({
    mutationFn: async (ticker) => {
      return apiDelete(`/api/tickers/${ticker}`);
    },
  });
}

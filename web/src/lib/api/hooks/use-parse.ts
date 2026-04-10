"use client";

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../client";
import type { ParseResult } from "@/lib/types";

export function useParseMutation() {
  return useMutation<ParseResult, Error, { file: File; brokerage: string; statementDate: string }>({
    mutationFn: async ({ file, brokerage, statementDate }) => {
      const formData = new FormData();
      formData.append("file", file);
      const params = new URLSearchParams({ brokerage, statement_date: statementDate });
      return apiPost<ParseResult>(`/api/parse?${params}`, formData);
    },
  });
}

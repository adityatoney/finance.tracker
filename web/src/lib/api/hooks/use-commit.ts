"use client";

import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../client";
import type { CommitRequest, CommitResult } from "@/lib/types";

export function useCommitMutation() {
  return useMutation<CommitResult, Error, CommitRequest>({
    mutationFn: async (body) => {
      return apiPost<CommitResult>("/api/commit", body as unknown as Record<string, unknown>);
    },
  });
}

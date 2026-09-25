"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { presetProfile, type RateProfile } from "@/domain/timing";

export function useSettings() {
  return useQuery({
    queryKey: ["me", "settings"],
    queryFn: () => api<{ rateProfile: RateProfile | null; preferences: Record<string, unknown> }>("/api/me/settings"),
    staleTime: 60_000,
  });
}

/** The user's calibrated speaking-rate profile, or the default preset. */
export function useRateProfile(): RateProfile {
  const q = useSettings();
  return q.data?.rateProfile ?? presetProfile("fast");
}

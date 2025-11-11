"use client";

import { useQuery } from "@tanstack/react-query";

export type LocationRecord = {
  id: string;
  name: string;
  identifier: string;
  taxRateBasisPoints: number;
  hotelSharePoints: number;
  hourlyRateCents: number;
  hourlyTierHours: number | null;
  overnightRateCents: number;
};

export function useLocations() {
  return useQuery<{ locations: LocationRecord[] }>({
    queryKey: ["locations"],
    queryFn: async () => {
      const response = await fetch("/api/locations", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load locations");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}


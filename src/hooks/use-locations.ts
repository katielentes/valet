"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PricingTier = {
  maxHours: number | null;
  rateCents: number;
  inOutPrivileges?: boolean;
};

export type LocationRecord = {
  id: string;
  name: string;
  identifier: string;
  taxRateBasisPoints: number;
  hotelSharePoints: number;
  overnightRateCents: number;
  overnightInOutPrivileges: boolean;
  pricingTiers: PricingTier[] | null;
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

type UpdateLocationVariables = {
  locationId: string;
  name?: string;
  taxRateBasisPoints?: number;
  hotelSharePoints?: number;
  overnightRateCents?: number;
  overnightInOutPrivileges?: boolean;
  pricingTiers?: PricingTier[];
};

type UpdateLocationResponse = {
  location: LocationRecord;
};

export function useUpdateLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation<UpdateLocationResponse, Error, UpdateLocationVariables>({
    mutationFn: async (variables) => {
      const { locationId, ...updates } = variables;
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to update location");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] }); // Pricing may affect tickets
      queryClient.invalidateQueries({ queryKey: ["reports"] }); // Pricing affects reports
    },
  });
}


"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Ticket = {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string | null;
  licensePlate: string | null;
  parkingLocation: string | null;
  rateType: "HOURLY" | "OVERNIGHT";
  inOutPrivileges: boolean;
  status: "CHECKED_IN" | "READY_FOR_PICKUP" | "COMPLETED" | "CANCELLED";
  vehicleStatus: "WITH_US" | "AWAY";
  checkInTime: string;
  durationDays: number | null;
  durationHours: number | null;
  willReturn: boolean | null;
  projectedAmountCents: number;
  elapsedHours: number;
  amountPaidCents: number;
  outstandingAmountCents: number;
  hasCompletedPayment: boolean;
  paymentComplete: boolean;
  notes?: string | null;
  location: {
    id: string;
    name: string;
    identifier: string;
    overnightInOutPrivileges: boolean;
    pricingTiers: Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null;
  };
  lastMessageAt: string | null;
};

export type TicketsResponse = {
  tickets: Ticket[];
  metrics: {
    total: number;
    withUs: number;
    away: number;
    ready: number;
    projectedRevenueCents: number;
  };
};

export type TicketFilters = {
  locationId?: string;
  status?: Ticket["status"];
  vehicleStatus?: Ticket["vehicleStatus"];
};

async function fetchTickets(filters: TicketFilters): Promise<TicketsResponse> {
  const query = new URLSearchParams();
  if (filters.locationId && filters.locationId !== "all") {
    query.set("locationId", filters.locationId);
  }
  if (filters.status) {
    query.set("status", filters.status);
  }
  if (filters.vehicleStatus) {
    query.set("vehicleStatus", filters.vehicleStatus);
  }

  const response = await fetch(`/api/tickets?${query.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load tickets");
  }

  return response.json();
}

export function useTicketsQuery(filters: TicketFilters) {
  const queryKey = useMemo(
    () => ["tickets", filters.locationId ?? "all", filters.status ?? "all", filters.vehicleStatus ?? "all"],
    [filters.locationId, filters.status, filters.vehicleStatus]
  );

  return useQuery<TicketsResponse>({
    queryKey,
    queryFn: () => fetchTickets(filters),
    staleTime: 1000 * 10, // Consider data stale after 10 seconds
    refetchInterval: 1000 * 15, // Refetch every 15 seconds for real-time updates
    refetchIntervalInBackground: true, // Continue refetching even when tab is in background
  });
}

type UpdateTicketVariables = {
  id: string;
  data: Partial<
    Pick<
      Ticket,
      | "customerName"
      | "customerPhone"
      | "vehicleMake"
      | "vehicleModel"
      | "vehicleColor"
      | "licensePlate"
      | "parkingLocation"
      | "rateType"
      | "inOutPrivileges"
      | "status"
      | "vehicleStatus"
      | "durationDays"
      | "durationHours"
    >
  > & {
    locationId?: string;
    notes?: string | null;
    checkInTime?: string;
  };
};

export function useUpdateTicketMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: UpdateTicketVariables) => {
      const response = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update ticket");
      }
      return payload as { ticket: Ticket };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

type CreateTicketVariables = {
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor?: string | null;
  licensePlate?: string | null;
  parkingLocation?: string | null;
  rateType: Ticket["rateType"];
  inOutPrivileges?: boolean;
  status?: Ticket["status"];
  vehicleStatus?: Ticket["vehicleStatus"];
  locationId: string;
  notes?: string | null;
  checkInTime?: string;
  durationDays?: number | null;
  durationHours?: number | null;
};

export function useCreateTicketMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTicketVariables) => {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create ticket");
      }
      return data as { ticket: Ticket };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useDeleteTicketMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error ?? "Failed to delete ticket");
      }
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export type UpdateTicketData = UpdateTicketVariables["data"];


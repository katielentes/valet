"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

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
  projectedAmountCents: number;
  elapsedHours: number;
  location: {
    id: string;
    name: string;
    identifier: string;
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
    staleTime: 1000 * 30,
  });
}


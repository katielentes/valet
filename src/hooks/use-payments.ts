"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type PaymentRecord = {
  id: string;
  status: "PENDING" | "PAYMENT_LINK_SENT" | "COMPLETED" | "FAILED" | "REFUNDED";
  amountCents: number;
  stripeLinkId: string | null;
  stripeProduct: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  ticket: {
    id: string;
    ticketNumber: string;
    customerName: string;
    customerPhone: string | null;
    location: {
      id: string;
      name: string;
      identifier: string;
    };
  };
};

export type PaymentsMetrics = {
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  completedAmountCents: number;
  pendingAmountCents: number;
};

export type PaymentsResponse = {
  payments: PaymentRecord[];
  metrics: PaymentsMetrics;
};

export type PaymentFilters = {
  status?: PaymentRecord["status"];
  locationId?: string;
  limit?: number;
};

async function fetchPayments(filters: PaymentFilters): Promise<PaymentsResponse> {
  const query = new URLSearchParams();
  if (filters.status) {
    query.set("status", filters.status);
  }
  if (filters.locationId && filters.locationId !== "all") {
    query.set("locationId", filters.locationId);
  }
  if (filters.limit) {
    query.set("limit", String(filters.limit));
  }

  const response = await fetch(`/api/payments?${query.toString()}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load payments");
  }

  return response.json();
}

export function usePaymentsQuery(filters: PaymentFilters) {
  const queryKey = useMemo(
    () => ["payments", filters.locationId ?? "all", filters.status ?? "all", filters.limit ?? "default"],
    [filters.locationId, filters.status, filters.limit]
  );

  return useQuery<PaymentsResponse>({
    queryKey,
    queryFn: () => fetchPayments(filters),
    staleTime: 1000 * 30,
  });
}

type CreatePaymentLinkVariables = {
  ticketId: string;
  message?: string;
};

type CreatePaymentLinkResponse = {
  payment: {
    id: string;
    ticketId: string;
    tenantId: string;
    stripeLinkId: string;
    stripeProduct: string;
    amountCents: number;
    status: string;
    createdAt: string;
  };
  paymentLinkUrl: string;
};

export function useCreatePaymentLinkMutation() {
  const queryClient = useQueryClient();
  return useMutation<CreatePaymentLinkResponse, Error, CreatePaymentLinkVariables>({
    mutationFn: async (variables) => {
      const response = await fetch("/api/payments/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(variables),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create payment link");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}


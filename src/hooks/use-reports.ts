"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ReportPeriod = "WEEKLY" | "MONTHLY" | "CUSTOM";

export type ReportData = {
  periodType: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  locationId: string | null;
  revenue: {
    completed: number;
    projected: number;
    total: number;
  };
  taxes: {
    total: number;
  };
  hotelShare: {
    total: number;
  };
  netRevenue: number;
  tickets: {
    completed: number;
    open: number;
    total: number;
    hourly: number;
    overnight: number;
  };
  vehicleStatus: {
    withUs: number;
    away: number;
  };
  locationBreakdown: Array<{
    name: string;
    identifier: string;
    completedRevenue: number;
    projectedRevenue: number;
    completedTickets: number;
    openTickets: number;
    hourlyTickets: number;
    overnightTickets: number;
    hourlyRevenue: number;
    overnightRevenue: number;
    taxRateBasisPoints: number;
    hotelSharePoints: number;
  }>;
};

export type GenerateReportParams = {
  periodType: ReportPeriod;
  periodStart?: string;
  periodEnd?: string;
  locationId?: string;
};

export type HistoricalReport = {
  id: string;
  periodType: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  location: {
    id: string;
    name: string;
    identifier: string;
  } | null;
  data: ReportData;
  createdAt: string;
};

async function generateReport(params: GenerateReportParams): Promise<{ report: ReportData }> {
  const response = await fetch("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.error ?? "Failed to generate report");
  }

  return response.json();
}

async function fetchReports(): Promise<{ reports: HistoricalReport[] }> {
  const response = await fetch("/api/reports", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to load reports");
  }

  return response.json();
}

export function useGenerateReportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useReportsQuery() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}


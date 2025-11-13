"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  DollarSign,
  Loader2,
  PieChart,
  TrendingUp,
  Calendar,
  Car,
  Building2,
} from "lucide-react";

import { useAppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useGenerateReportMutation,
  useReportsQuery,
  type ReportPeriod,
} from "@/hooks/use-reports";
import { toast } from "sonner";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function ReportsPage() {
  const { location } = useAppShell();
  const [periodType, setPeriodType] = useState<ReportPeriod>("WEEKLY");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const generateReport = useGenerateReportMutation();
  const { data: reportsData, isLoading: reportsLoading } = useReportsQuery();

  const handleGenerate = async () => {
    try {
      const params: Parameters<typeof generateReport.mutateAsync>[0] = {
        periodType,
        ...(periodType === "CUSTOM" && customStart && customEnd
          ? {
              periodStart: new Date(customStart).toISOString(),
              periodEnd: new Date(customEnd).toISOString(),
            }
          : {}),
        ...(location && location !== "all" ? { locationId: location } : {}),
      };

      await generateReport.mutateAsync(params);
      toast.success("Report generated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate report");
    }
  };

  // Filter reports by current location if a location is selected
  const filteredReports = reportsData?.reports?.filter((report) => {
    if (location === "all") return true;
    return report.location?.id === location || !report.location;
  }) ?? [];
  
  const latestReport = filteredReports[0];
  
  // Check if the latest report matches the current location filter
  const reportLocationMatches = 
    !latestReport || 
    location === "all" || 
    latestReport.location?.id === location;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Generate weekly, monthly, and custom period analytics for revenue, tickets, and operations.
          </p>
        </div>
      </div>

      <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as ReportPeriod)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="WEEKLY">Weekly</TabsTrigger>
          <TabsTrigger value="MONTHLY">Monthly</TabsTrigger>
          <TabsTrigger value="CUSTOM">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="WEEKLY" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Last 7 Days</CardTitle>
              <CardDescription>Generate a report for the past week</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGenerate}
                disabled={generateReport.isPending}
                className="w-full sm:w-auto"
              >
                {generateReport.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  <>
                    <PieChart className="size-4" />
                    Generate Weekly Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="MONTHLY" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Month</CardTitle>
              <CardDescription>Generate a report for the current month</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleGenerate}
                disabled={generateReport.isPending}
                className="w-full sm:w-auto"
              >
                {generateReport.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  <>
                    <PieChart className="size-4" />
                    Generate Monthly Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="CUSTOM" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom Date Range</CardTitle>
              <CardDescription>Select a custom date range for your report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generateReport.isPending || !customStart || !customEnd}
                className="w-full sm:w-auto"
              >
                {generateReport.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  <>
                    <PieChart className="size-4" />
                    Generate Custom Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!reportLocationMatches && latestReport && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-lg text-amber-900">Location Filter Mismatch</CardTitle>
            <CardDescription className="text-amber-700">
              The displayed report is for {latestReport.location?.name ?? "all locations"}. 
              Generate a new report to see data for the currently selected location.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {reportsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : latestReport ? (
        <ReportDisplay report={latestReport.data} />
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">No reports generated yet</CardTitle>
            <CardDescription>
              Generate your first report using the options above to see analytics and insights.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {reportsData && filteredReports.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Historical Reports</CardTitle>
            <CardDescription>
              {location !== "all" 
                ? `View previously generated reports for the selected location`
                : "View previously generated reports"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredReports.slice(1, 11).map((report) => (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{report.periodType}</Badge>
                    <span className="text-muted-foreground">
                      {format(new Date(report.periodStart), "MMM d")} -{" "}
                      {format(new Date(report.periodEnd), "MMM d, yyyy")}
                    </span>
                    {report.location && (
                      <>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-muted-foreground">{report.location.name}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {currencyFormatter.format(report.data.revenue.completed / 100)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(report.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type ReportDisplayProps = {
  report: {
    revenue?: {
      completed: number;
      refunded: number;
      projected: number;
      total: number;
    };
    taxes?: {
      total: number;
    };
    hotelShare?: {
      total: number;
    };
    netRevenue?: number;
    tickets?: {
      completed: number;
      open: number;
      total: number;
      hourly: number;
      overnight: number;
    };
    vehicleStatus?: {
      withUs: number;
      away: number;
    };
    locationBreakdown?: Array<{
      name: string;
      identifier: string;
      completedRevenue: number;
      refundedRevenue: number;
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
};

function ReportDisplay({ report }: ReportDisplayProps) {
  const revenueMetrics = [
    {
      label: "Completed Revenue",
      value: currencyFormatter.format((report.revenue?.completed ?? 0) / 100),
      sublabel: "Payments received",
      icon: DollarSign,
      color: "text-emerald-600",
    },
    {
      label: "Refunded",
      value: currencyFormatter.format((report.revenue?.refunded ?? 0) / 100),
      sublabel: "Total refunds",
      icon: DollarSign,
      color: "text-rose-600",
    },
    {
      label: "Projected Revenue",
      value: currencyFormatter.format((report.revenue?.projected ?? 0) / 100),
      sublabel: "From open tickets",
      icon: TrendingUp,
      color: "text-blue-600",
    },
    {
      label: "Total Revenue",
      value: currencyFormatter.format((report.revenue?.total ?? 0) / 100),
      sublabel: "Completed + projected",
      icon: PieChart,
      color: "text-primary",
    },
    {
      label: "Net Revenue",
      value: currencyFormatter.format((report.netRevenue ?? 0) / 100),
      sublabel: "After taxes & hotel share",
      icon: DollarSign,
      color: "text-purple-600",
    },
  ];

  const ticketMetrics = [
    {
      label: "Completed Tickets",
      value: report.tickets?.completed ?? 0,
      sublabel: "Closed in period",
    },
    {
      label: "Open Tickets",
      value: report.tickets?.open ?? 0,
      sublabel: "Currently active",
    },
    {
      label: "Hourly Tickets",
      value: report.tickets?.hourly ?? 0,
      sublabel: "Completed hourly",
    },
    {
      label: "Overnight Tickets",
      value: report.tickets?.overnight ?? 0,
      sublabel: "Completed overnight",
    },
  ];

  const totalTax = (report.taxes?.total ?? 0) / 100;
  const totalHotelShare = (report.hotelShare?.total ?? 0) / 100;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {revenueMetrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <metric.icon className={`size-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${metric.color}`}>{metric.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{metric.sublabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ticketMetrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <Car className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{metric.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{metric.sublabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Financial Breakdown</CardTitle>
            <CardDescription>Taxes and hotel revenue share</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Taxes</span>
              <span className="font-semibold">{currencyFormatter.format(totalTax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Hotel Share</span>
              <span className="font-semibold">{currencyFormatter.format(totalHotelShare)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Net Revenue</span>
              <span className="text-lg font-semibold text-purple-600">
                {currencyFormatter.format(report.netRevenue / 100)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vehicle Status</CardTitle>
            <CardDescription>Current vehicle locations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">With Us</span>
              <span className="font-semibold text-emerald-600">{report.vehicleStatus?.withUs ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Away</span>
              <span className="font-semibold text-amber-600">{report.vehicleStatus?.away ?? 0}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Active</span>
              <span className="text-lg font-semibold">
                {(report.vehicleStatus?.withUs ?? 0) + (report.vehicleStatus?.away ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {report.locationBreakdown && report.locationBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Location Breakdown</CardTitle>
            <CardDescription>Revenue and ticket metrics by location</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {report.locationBreakdown.map((location) => {
                const locationTax = Math.round(
                  (location.completedRevenue * location.taxRateBasisPoints) / 10000
                );
                const locationHotelShare = Math.round(
                  (location.completedRevenue * location.hotelSharePoints) / 10000
                );
                const locationNetRevenue = location.completedRevenue - (location.refundedRevenue ?? 0) - locationTax - locationHotelShare;

                return (
                  <div key={location.identifier} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{location.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {location.identifier}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {currencyFormatter.format(location.completedRevenue / 100)}
                      </Badge>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Completed Revenue</p>
                        <p className="mt-1 text-lg font-semibold">
                          {currencyFormatter.format(location.completedRevenue / 100)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Refunded</p>
                        <p className="mt-1 text-lg font-semibold text-rose-600">
                          {currencyFormatter.format((location.refundedRevenue ?? 0) / 100)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Projected Revenue</p>
                        <p className="mt-1 text-lg font-semibold text-blue-600">
                          {currencyFormatter.format(location.projectedRevenue / 100)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Net Revenue</p>
                        <p className="mt-1 text-lg font-semibold text-purple-600">
                          {currencyFormatter.format(locationNetRevenue / 100)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Total Tickets</p>
                        <p className="mt-1 text-lg font-semibold">
                          {location.completedTickets + location.openTickets}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Hourly Tickets</p>
                        <p className="mt-1 text-lg font-semibold">{location.hourlyTickets}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {currencyFormatter.format(location.hourlyRevenue / 100)} revenue
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Overnight Tickets</p>
                        <p className="mt-1 text-lg font-semibold">{location.overnightTickets}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {currencyFormatter.format(
                            (location.completedRevenue - location.hourlyRevenue) / 100
                          )}{" "}
                          revenue
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md border bg-muted/40 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tax Rate</span>
                        <span className="font-medium">
                          {(location.taxRateBasisPoints / 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-muted-foreground">Hotel Share</span>
                        <span className="font-medium">
                          {(location.hotelSharePoints / 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <Separator />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


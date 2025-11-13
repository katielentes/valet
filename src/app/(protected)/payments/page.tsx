"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { DollarSign, Filter, Loader2, RefreshCcw, Wallet2, Clock3, RotateCcw } from "lucide-react";

import { useAppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefundPaymentDialog } from "@/components/payments/refund-payment-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaymentsQuery, type PaymentFilters, type PaymentRecord } from "@/hooks/use-payments";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<{
  id: string;
  label: string;
  status: PaymentRecord["status"] | undefined;
}> = [
  { id: "all", label: "All", status: undefined },
  { id: "completed", label: "Completed", status: "COMPLETED" },
  { id: "pending", label: "Pending", status: "PENDING" },
  { id: "link-sent", label: "Link Sent", status: "PAYMENT_LINK_SENT" },
  { id: "failed", label: "Failed", status: "FAILED" },
  { id: "refunded", label: "Refunded", status: "REFUNDED" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function PaymentsPage() {
  const { location } = useAppShell();
  const [activeStatus, setActiveStatus] = useState(STATUS_FILTERS[0]);

  const filters: PaymentFilters = useMemo(
    () => ({
      locationId: location,
      status: activeStatus.status,
      limit: 75,
    }),
    [activeStatus.status, location]
  );

  const { data, isLoading, error, refetch, isFetching } = usePaymentsQuery(filters);
  const { session } = useAppShell();

  const payments = data?.payments ?? [];
  const metrics = data?.metrics;
  const [paymentForRefund, setPaymentForRefund] = useState<PaymentRecord | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  const canRefund = session.user.role === "ADMIN" || session.user.role === "MANAGER";

  const handleOpenRefundDialog = (payment: PaymentRecord) => {
    setPaymentForRefund(payment);
    setRefundDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Monitor Stripe links, track settlement progress, and reconcile outstanding balances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Refreshing
              </span>
            ) : (
              <>
                <RefreshCcw className="size-4" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      <PaymentsMetrics loading={isLoading} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled
          title="Advanced filters coming soon"
        >
          <Filter className="size-4" />
          Filters
        </Button>
        <Separator orientation="vertical" className="hidden h-6 lg:flex" />
        <div className="flex items-center gap-2 rounded-full bg-muted p-1">
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeStatus.id === filter.id;
            return (
              <Button
                key={filter.id}
                size="sm"
                variant={isActive ? "default" : "ghost"}
                className={cn("rounded-full px-4", !isActive && "text-muted-foreground")}
                onClick={() => setActiveStatus(filter)}
              >
                {filter.label}
              </Button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load payments right now. Please try again shortly.
        </div>
      ) : null}

      <RefundPaymentDialog
        payment={paymentForRefund}
        open={refundDialogOpen}
        onOpenChange={(open) => {
          setRefundDialogOpen(open);
          if (!open) {
            setPaymentForRefund(null);
          }
        }}
      />

      <PaymentList
        loading={isLoading}
        payments={payments}
        onRefund={canRefund ? handleOpenRefundDialog : undefined}
      />

      <div className="rounded-lg border bg-muted/50 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Need to mark a payment as collected?</p>
        <p>
          Add a new `PENDING` payment row in Prisma Studio (or via script) with the amount received.
          The ticket will unlock once a corresponding `COMPLETED` payment equals the projected balance.
        </p>
      </div>
    </div>
  );

  function PaymentsMetrics({ loading }: { loading: boolean }) {
    const totalCollected = metrics ? metrics.completedAmountCents / 100 : 0;
    const pendingAmount = metrics ? metrics.pendingAmountCents / 100 : 0;
    const totalRefunded = metrics ? metrics.totalRefundedAmountCents / 100 : 0;
    const netCollected = totalCollected - totalRefunded;

    const items = [
      {
        label: "Total Collected",
        value: currencyFormatter.format(totalCollected),
        sublabel: `${metrics?.completedCount ?? 0} payment${
          (metrics?.completedCount ?? 0) === 1 ? "" : "s"
        } settled`,
        icon: DollarSign,
      },
      {
        label: "Total Refunded",
        value: currencyFormatter.format(totalRefunded),
        sublabel: `${metrics?.refundedCount ?? 0} payment${
          (metrics?.refundedCount ?? 0) === 1 ? "" : "s"
        } refunded`,
        icon: DollarSign,
        color: "text-rose-600",
      },
      {
        label: "Net Collected",
        value: currencyFormatter.format(netCollected),
        sublabel: "After refunds",
        icon: DollarSign,
        color: "text-emerald-600",
      },
      {
        label: "Pending Collections",
        value: currencyFormatter.format(pendingAmount),
        sublabel: `${metrics?.pendingCount ?? 0} payment${
          (metrics?.pendingCount ?? 0) === 1 ? "" : "s"
        } in progress`,
        icon: Clock3,
      },
      {
        label: "Recorded Payments",
        value: metrics?.totalCount ?? 0,
        sublabel: "Last 75 entries",
        icon: Wallet2,
      },
    ];

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
              <item.icon className={cn("size-4", item.color ?? "text-muted-foreground")} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <CardTitle className={cn("text-2xl font-semibold", item.color)}>
                  {item.value}
                </CardTitle>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{item.sublabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
}

type PaymentListProps = {
  loading: boolean;
  payments: PaymentRecord[];
  onRefund?: (payment: PaymentRecord) => void;
};

function PaymentList({ loading, payments, onRefund }: PaymentListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
        </Card>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">No payments match this view</CardTitle>
          <CardDescription>
            Adjust your filters or trigger a new payment link from the Tickets screen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-lg border bg-card shadow-sm md:block">
        <table className="w-full caption-bottom text-sm">
          <colgroup>
            <col className="w-[12rem]" />
            <col />
            <col className="w-[12rem]" />
            <col className="w-[10rem]" />
            <col className="w-[6rem]" />
          </colgroup>
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Ticket</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <PaymentTableRow key={payment.id} payment={payment} onRefund={onRefund} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {payments.map((payment) => (
          <PaymentCard key={payment.id} payment={payment} onRefund={onRefund} />
        ))}
      </div>
    </div>
  );
}

function PaymentTableRow({
  payment,
  onRefund,
}: {
  payment: PaymentRecord;
  onRefund?: (payment: PaymentRecord) => void;
}) {
  const amount = currencyFormatter.format(payment.amountCents / 100);
  const refundAmount = payment.refundAmountCents > 0 ? currencyFormatter.format(payment.refundAmountCents / 100) : null;
  const netAmount = currencyFormatter.format((payment.amountCents - (payment.refundAmountCents ?? 0)) / 100);
  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return format(date, "MMM d, h:mm a");
  };

  const statusStyles: Record<PaymentRecord["status"], { label: string; badgeClasses: string }> = {
    COMPLETED: { label: "Completed", badgeClasses: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    PENDING: { label: "Pending", badgeClasses: "bg-amber-50 text-amber-700 border-amber-200" },
    PAYMENT_LINK_SENT: {
      label: "Link Sent",
      badgeClasses: "bg-amber-50 text-amber-700 border-amber-200",
    },
    FAILED: { label: "Failed", badgeClasses: "bg-rose-50 text-rose-600 border-rose-200" },
    REFUNDED: { label: "Refunded", badgeClasses: "bg-slate-100 text-slate-600 border-slate-200" },
  };

  const statusBadge = statusStyles[payment.status];
  const canRefund = onRefund && payment.status === "COMPLETED" && (payment.refundAmountCents ?? 0) < payment.amountCents;

  return (
    <tr className="border-t text-sm">
      <td className="px-4 py-3 align-top font-medium text-foreground">
        <div className="flex flex-col gap-1">
          <span>{amount}</span>
          {refundAmount && (
            <span className="text-xs text-rose-600">Refunded: -{refundAmount}</span>
          )}
          <span className="text-xs font-medium text-emerald-600">Net: {netAmount}</span>
          <span className="text-xs text-muted-foreground">
            {payment.stripeLinkId ?? "No link recorded"}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{payment.ticket.ticketNumber}</span>
          <span className="text-xs text-muted-foreground">{payment.ticket.location.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-col gap-1">
          <span>{payment.ticket.customerName}</span>
          <span className="text-xs text-muted-foreground">
            {payment.ticket.customerPhone ?? "No phone on file"}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>{formatDate(payment.createdAt)}</span>
          <span className="text-xs">Updated: {formatDate(payment.updatedAt)}</span>
          {payment.refundedAt && (
            <span className="text-xs text-rose-600">Refunded: {formatDate(payment.refundedAt)}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("capitalize", statusBadge.badgeClasses)}>
            {statusBadge.label}
          </Badge>
          {canRefund && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRefund(payment)}
              className="h-7 gap-1 text-xs"
            >
              <RotateCcw className="size-3" />
              Refund
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function PaymentCard({
  payment,
  onRefund,
}: {
  payment: PaymentRecord;
  onRefund?: (payment: PaymentRecord) => void;
}) {
  const amount = currencyFormatter.format(payment.amountCents / 100);
  const refundAmount = payment.refundAmountCents > 0 ? currencyFormatter.format(payment.refundAmountCents / 100) : null;
  const netAmount = currencyFormatter.format((payment.amountCents - (payment.refundAmountCents ?? 0)) / 100);
  const metadataDisplay = payment.metadata ? JSON.stringify(payment.metadata, null, 2) : null;

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return format(date, "MMM d, h:mm a");
  };

  const statusStyles: Record<PaymentRecord["status"], { label: string; badgeClasses: string }> = {
    COMPLETED: { label: "Completed", badgeClasses: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    PENDING: { label: "Pending", badgeClasses: "bg-amber-50 text-amber-700 border-amber-200" },
    PAYMENT_LINK_SENT: {
      label: "Link Sent",
      badgeClasses: "bg-amber-50 text-amber-700 border-amber-200",
    },
    FAILED: { label: "Failed", badgeClasses: "bg-rose-50 text-rose-600 border-rose-200" },
    REFUNDED: { label: "Refunded", badgeClasses: "bg-slate-100 text-slate-600 border-slate-200" },
  };

  const canRefund = onRefund && payment.status === "COMPLETED" && (payment.refundAmountCents ?? 0) < payment.amountCents;

  const statusBadge = statusStyles[payment.status];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg font-semibold">{amount}</CardTitle>
            {refundAmount && (
              <span className="text-xs text-rose-600">Refunded: -{refundAmount}</span>
            )}
            <span className="text-xs font-medium text-emerald-600">Net: {netAmount}</span>
          </div>
          <Badge variant="outline" className={cn("capitalize", statusBadge.badgeClasses)}>
            {statusBadge.label}
          </Badge>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{payment.ticket.ticketNumber}</span>
          <Separator orientation="vertical" className="h-3" />
          <span>{payment.ticket.customerName}</span>
          <Badge variant="outline" className="capitalize">
            {payment.ticket.location.name.toLowerCase()}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        {canRefund && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRefund(payment)}
            className="w-full gap-2"
          >
            <RotateCcw className="size-4" />
            Refund Payment
          </Button>
        )}
        <div className="flex items-center justify-between">
          <span>Created</span>
          <span className="font-medium text-foreground">{formatDate(payment.createdAt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Last updated</span>
          <span>{formatDate(payment.updatedAt)}</span>
        </div>
        {payment.refundedAt && (
          <div className="flex items-center justify-between">
            <span className="text-rose-600">Refunded</span>
            <span className="font-medium text-rose-600">{formatDate(payment.refundedAt)}</span>
          </div>
        )}
        {payment.stripeLinkId ? (
          <div className="flex items-center justify-between">
            <span>Stripe link ID</span>
            <span className="font-mono text-xs">{payment.stripeLinkId}</span>
          </div>
        ) : null}
        {metadataDisplay ? (
          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Metadata</p>
            <pre className="mt-1 whitespace-pre-wrap break-words text-[11px]">{metadataDisplay}</pre>
          </div>
        ) : null}
        <div className="rounded-md border bg-muted/40 p-2 text-xs">
          <p className="font-medium text-foreground">Guest</p>
          <p>{payment.ticket.customerName}</p>
          <p className="font-mono text-xs">{payment.ticket.customerPhone ?? "No phone on file"}</p>
        </div>
      </CardContent>
    </Card>
  );
}



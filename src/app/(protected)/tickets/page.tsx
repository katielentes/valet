"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCcw,
  Filter,
  CreditCard,
  Send,
  CarFront,
  MoreHorizontal,
  Moon,
  Clock,
  ArrowLeftRight,
  Lock,
  CheckCircle,
  Package,
  CircleCheckBig,
  XCircle,
  Home,
  Navigation,
  AlertCircle,
  Building,
  DollarSign,
  RotateCcw,
  X,
} from "lucide-react";
import { format } from "date-fns";

import { useAppShell } from "@/components/layout/app-shell";
import { EditTicketDialog } from "@/components/tickets/edit-ticket-dialog";
import { SendPaymentLinkDialog } from "@/components/payments/send-payment-link-dialog";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { SendMessageDialog } from "@/components/messages/send-message-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTicketsQuery,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  type Ticket,
  type TicketFilters,
  type UpdateTicketData,
} from "@/hooks/use-tickets";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All", status: undefined, vehicleStatus: undefined },
  { id: "ready", label: "Ready", status: "READY_FOR_PICKUP" as const, vehicleStatus: undefined },
  { id: "away", label: "Away", status: undefined, vehicleStatus: "AWAY" as const },
  { id: "with-us", label: "With Us", status: undefined, vehicleStatus: "WITH_US" as const },
];

export default function TicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { location: appShellLocation, setLocation, role, searchQuery } = useAppShell();
  
  // Get location from URL params on initial load, or fall back to app shell location
  const locationFromUrl = searchParams.get("location");
  const location = locationFromUrl ?? appShellLocation;
  
  // Initialize location from URL on mount and sync to app shell
  useEffect(() => {
    if (locationFromUrl && locationFromUrl !== appShellLocation) {
      setLocation(locationFromUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- Only run on mount
  
  // Sync location to URL when app shell location changes (from dropdown)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (appShellLocation === "all" || !appShellLocation) {
      params.delete("location");
    } else {
      params.set("location", appShellLocation);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    if (window.location.search !== (params.toString() ? `?${params.toString()}` : "")) {
      router.replace(newUrl, { scroll: false });
    }
  }, [appShellLocation, router, searchParams]);
  
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const filters: TicketFilters = useMemo(() => {
    return {
      locationId: location,
      status: activeFilter.status,
      vehicleStatus: activeFilter.vehicleStatus,
    };
  }, [activeFilter, location]);

  const { data, isLoading, error, refetch, isFetching } = useTicketsQuery(filters);
  
  // Filter tickets client-side based on search query
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) {
      return data?.tickets ?? [];
    }
    
    const query = searchQuery.toLowerCase().trim();
    return (data?.tickets ?? []).filter((ticket) => {
      return (
        ticket.ticketNumber.toLowerCase().includes(query) ||
        ticket.customerName.toLowerCase().includes(query) ||
        ticket.customerPhone.toLowerCase().includes(query) ||
        (ticket.licensePlate?.toLowerCase().includes(query) ?? false) ||
        ticket.vehicleMake.toLowerCase().includes(query) ||
        ticket.vehicleModel.toLowerCase().includes(query) ||
        (ticket.vehicleColor?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [data?.tickets, searchQuery]);
  
  const [ticketForMessage, setTicketForMessage] = useState<Ticket | null>(null);
  const [ticketForPayment, setTicketForPayment] = useState<Ticket | null>(null);
  const [ticketForEdit, setTicketForEdit] = useState<Ticket | null>(null);
  const [ticketForDelete, setTicketForDelete] = useState<Ticket | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleOpenSendDialog = (ticket: Ticket) => {
    setTicketForMessage(ticket);
    setMessageDialogOpen(true);
  };

  const handleOpenPaymentDialog = (ticket: Ticket) => {
    setTicketForPayment(ticket);
    setPaymentDialogOpen(true);
  };

  const updateTicket = useUpdateTicketMutation();
  const deleteTicket = useDeleteTicketMutation();
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);

  const handleTicketUpdate = async (ticketId: string, data: UpdateTicketData) => {
    setUpdatingTicketId(ticketId);
    try {
      await updateTicket.mutateAsync({ id: ticketId, data });
    } finally {
      setUpdatingTicketId((current) => (current === ticketId ? null : current));
    }
  };

  const handleTicketDelete = async () => {
    if (!ticketForDelete) return;
    setDeletingTicketId(ticketForDelete.id);
    try {
      await deleteTicket.mutateAsync(ticketForDelete.id);
      toast.success(`Ticket ${ticketForDelete.ticketNumber} deleted`);
      setTicketForDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete ticket");
    } finally {
      setDeletingTicketId(null);
    }
  };

  const handleOpenEditDialog = (ticket: Ticket) => {
    setTicketForEdit(ticket);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />

      <SendMessageDialog
        ticket={ticketForMessage}
        open={messageDialogOpen}
        onOpenChange={(open) => {
          setMessageDialogOpen(open);
          if (!open) {
            setTicketForMessage(null);
          }
        }}
      />

      <SendPaymentLinkDialog
        ticket={ticketForPayment}
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (!open) {
            setTicketForPayment(null);
          }
        }}
      />

      <EditTicketDialog
        ticket={ticketForEdit}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setTicketForEdit(null);
          }
        }}
        onDelete={setTicketForDelete}
        canDelete={role === "ADMIN" || role === "MANAGER"}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Active Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Monitor cars on-site, track pickup status, and keep customers in the loop.
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
          <Button onClick={() => setNewTicketOpen(true)} size="sm">
            New Ticket
          </Button>
        </div>
      </div>

      <div className="hidden md:block">
        <MetricsSummary loading={isLoading} metrics={data?.metrics} />
      </div>

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
          {FILTERS.map((filter) => {
            const isActive = activeFilter.id === filter.id;
            return (
              <Button
                key={filter.id}
                size="sm"
                variant={isActive ? "default" : "ghost"}
                className={cn("rounded-full px-4", !isActive && "text-muted-foreground")}
                onClick={() => setActiveFilter(filter)}
              >
                {filter.label}
              </Button>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load tickets right now. Please try again shortly.
        </div>
        ) : null}

      <AlertDialog open={!!ticketForDelete} onOpenChange={(open) => !open && setTicketForDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete ticket <strong>{ticketForDelete?.ticketNumber}</strong>? This will
              permanently delete the ticket and all associated messages, payments, and audit logs. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTicketDelete}
              disabled={deletingTicketId === ticketForDelete?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingTicketId === ticketForDelete?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TicketResults
        loading={isLoading}
        tickets={filteredTickets}
        onNotify={handleOpenSendDialog}
        onEdit={handleOpenEditDialog}
        onPayment={handleOpenPaymentDialog}
        onUpdate={handleTicketUpdate}
        updatingTicketId={updatingTicketId}
      />
    </div>
  );
}

type MetricsSummaryProps = {
  loading: boolean;
  metrics:
    | {
        total: number;
        withUs: number;
        away: number;
        ready: number;
        projectedRevenueCents: number;
      }
    | undefined;
};

function MetricsSummary({ loading, metrics }: MetricsSummaryProps) {
  const items = [
    {
      label: "Total Active",
      value: metrics?.total ?? 0,
      sublabel: "Tickets checked-in or waiting pickup",
    },
    {
      label: "Vehicles With Us",
      value: metrics?.withUs ?? 0,
      sublabel: "On-site and parked",
    },
    {
      label: "Vehicles Away",
      value: metrics?.away ?? 0,
      sublabel: "Clients with in/out privileges",
    },
    {
      label: "Projected Revenue",
      value: metrics ? `$${(metrics.projectedRevenueCents / 100).toFixed(2)}` : "$0.00",
      sublabel: "Based on current tickets",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="space-y-1">
            <CardDescription>{item.label}</CardDescription>
            {loading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            )}
            <p className="text-xs text-muted-foreground">{item.sublabel}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

type TicketResultsProps = {
  loading: boolean;
  tickets: Ticket[];
  onNotify: (ticket: Ticket) => void;
  onEdit: (ticket: Ticket) => void;
  onPayment: (ticket: Ticket) => void;
  onUpdate: (ticketId: string, data: UpdateTicketData) => Promise<void>;
  updatingTicketId: string | null;
};

function TicketResults({
  loading,
  tickets,
  onNotify,
  onEdit,
  onPayment,
  onUpdate,
  updatingTicketId,
}: TicketResultsProps) {
  // Sort tickets: READY_FOR_PICKUP first, then by check-in time
  // Must be called before any early returns (React Hooks rule)
  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      // READY_FOR_PICKUP tickets always come first
      if (a.status === "READY_FOR_PICKUP" && b.status !== "READY_FOR_PICKUP") {
        return -1;
      }
      if (a.status !== "READY_FOR_PICKUP" && b.status === "READY_FOR_PICKUP") {
        return 1;
      }
      // Within same status group, sort by check-in time (newest first)
      return new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime();
    });
  }, [tickets]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="space-y-4 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">No tickets match this view</CardTitle>
          <CardDescription>
            Adjust your filters or create a new ticket for Hampton Inn or Hyatt Regency.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sortedTickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          onNotify={onNotify}
          onEdit={onEdit}
          onPayment={onPayment}
          onUpdate={onUpdate}
          isUpdating={updatingTicketId === ticket.id}
        />
      ))}
    </div>
  );
}

type TicketCardProps = {
  ticket: Ticket;
  onNotify: (ticket: Ticket) => void;
  onEdit: (ticket: Ticket) => void;
  onPayment: (ticket: Ticket) => void;
  onUpdate: TicketResultsProps["onUpdate"];
  isUpdating: boolean;
};

function TicketCard({ ticket, onNotify, onEdit, onPayment, onUpdate, isUpdating }: TicketCardProps) {
  const projectedAmount = `$${(ticket.projectedAmountCents / 100).toFixed(2)}`;
  const outstandingAmount = ticket.outstandingAmountCents / 100;
  const amountPaid = ticket.amountPaidCents / 100;
  const paymentComplete = ticket.paymentComplete;
  
  // Determine if this ticket's rate type has in/out privileges enabled at the location
  const hasInOutPrivileges = useMemo(() => {
    if (ticket.rateType === "OVERNIGHT") {
      // For overnight, check the location's overnightInOutPrivileges setting
      // Also check if there's a final tier (maxHours: null) with inOutPrivileges enabled
      if (ticket.location.overnightInOutPrivileges) {
        return true;
      }
      // Fallback to checking final tier if overnightInOutPrivileges is not set
      if (ticket.location.pricingTiers && ticket.location.pricingTiers.length > 0) {
        const finalTier = ticket.location.pricingTiers.find((tier) => tier.maxHours === null);
        return finalTier?.inOutPrivileges === true;
      }
      return false;
    } else {
      // For hourly, check if any hourly tier (maxHours !== null) has inOutPrivileges
      if (!ticket.location.pricingTiers || ticket.location.pricingTiers.length === 0) {
        return false; // No tiers configured, no in/out privileges
      }
      return ticket.location.pricingTiers.some(
        (tier) => tier.maxHours !== null && tier.inOutPrivileges === true
      );
    }
  }, [ticket.location.pricingTiers, ticket.location.overnightInOutPrivileges, ticket.rateType]);
  
  const requiresPaymentBeforeAway =
    hasInOutPrivileges && ticket.vehicleStatus === "WITH_US" && ticket.outstandingAmountCents > 0;
  const statusOptions: Array<{ label: string; value: typeof ticket.status }> = [
    { label: "Checked In", value: "CHECKED_IN" },
    { label: "Ready for Pickup", value: "READY_FOR_PICKUP" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Cancelled", value: "CANCELLED" },
  ];
  const rateBadge =
    ticket.rateType === "OVERNIGHT" ? (
      <Badge variant="secondary" className="gap-1">
        <Moon className="size-3" />
        Overnight
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        <Clock className="size-3" />
        Hourly
      </Badge>
    );
  const vehicleBorderStyles: Record<Ticket["vehicleStatus"], string> = {
    WITH_US: "border-l-4 border-l-emerald-500 shadow-sm shadow-emerald-100",
    AWAY: "border-l-4 border-l-amber-400 shadow-sm shadow-amber-100",
  };

  // Special styling for READY_FOR_PICKUP - whole card gets unique green color
  const isReadyForPickup = ticket.status === "READY_FOR_PICKUP";
  const readyForPickupStyles = isReadyForPickup
    ? "bg-green-50 border-green-300 border-2 shadow-lg shadow-green-100"
    : "";

  // Special styling for paid tickets that aren't ready yet - unique blue background
  const isPaidButNotReady = paymentComplete && !isReadyForPickup && ticket.status !== "COMPLETED" && ticket.status !== "CANCELLED";
  const paidButNotReadyStyles = isPaidButNotReady
    ? "bg-blue-50 shadow-md shadow-blue-100"
    : "";

  const privilegesBadge = hasInOutPrivileges ? (
    <Badge variant="secondary" className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-700">
      <ArrowLeftRight className="size-3" />
      In/Out Privileges
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Lock className="size-3" />
      Single Entry
    </Badge>
  );

  const vehicleChip =
    ticket.vehicleStatus === "WITH_US" ? (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
        <Home className="size-3" />
        With Us
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
        <Navigation className="size-3" />
        Away
      </Badge>
    );

  const statusChipMap: Record<Ticket["status"], { label: string; classes: string; icon: React.ReactNode }> = {
    CHECKED_IN: { 
      label: "Checked In", 
      classes: "bg-blue-50 text-blue-700 border-blue-200",
      icon: <CheckCircle className="size-3" />
    },
    READY_FOR_PICKUP: { 
      label: "Ready", 
      classes: "bg-amber-50 text-amber-700 border-amber-200",
      icon: <Package className="size-3" />
    },
    COMPLETED: { 
      label: "Completed", 
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: <CircleCheckBig className="size-3" />
    },
    CANCELLED: { 
      label: "Cancelled", 
      classes: "bg-rose-50 text-rose-700 border-rose-200",
      icon: <XCircle className="size-3" />
    },
  };

  const currentStatusChip = statusChipMap[ticket.status];
  const paymentBadge = paymentComplete ? (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
      <DollarSign className="size-3" />
      Paid
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1">
      <AlertCircle className="size-3" />
      Payment Needed
    </Badge>
  );

  return (
    <Card
      className={cn(
        "flex h-full flex-col transition-shadow hover:shadow-lg",
        // READY_FOR_PICKUP gets whole card colored (overrides everything)
        isReadyForPickup
          ? readyForPickupStyles
          : cn(
              // Otherwise, apply vehicle status border AND paid background if applicable
              vehicleBorderStyles[ticket.vehicleStatus],
              paidButNotReadyStyles
            )
      )}
    >
      <CardHeader className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg font-semibold">{ticket.ticketNumber}</CardTitle>
            {rateBadge}
            {privilegesBadge}
            {hasInOutPrivileges && ticket.willReturn !== null && (
              <Badge 
                variant="outline" 
                className={cn(
                  "gap-1",
                  ticket.willReturn 
                    ? "bg-blue-50 text-blue-700 border-blue-200" 
                    : "bg-gray-50 text-gray-700 border-gray-200"
                )}
              >
                {ticket.willReturn ? (
                  <>
                    <RotateCcw className="size-3" />
                    Returning
                  </>
                ) : (
                  <>
                    <X className="size-3" />
                    Not Returning
                  </>
                )}
              </Badge>
            )}
            <Badge variant="outline" className={cn("capitalize gap-1", currentStatusChip.classes)}>
              {currentStatusChip.icon}
              {currentStatusChip.label}
            </Badge>
            {vehicleChip}
            {paymentBadge}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(ticket)}
            aria-label="Edit ticket"
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
        <CardDescription className="flex items-center justify-between gap-2 text-sm">
          <span>{ticket.customerName}</span>
          <Badge variant="outline" className="capitalize gap-1">
            <Building className="size-3" />
            {ticket.location.name.toLowerCase()}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Vehicle</span>
            <span>
              {ticket.vehicleMake} {ticket.vehicleModel}
              {ticket.vehicleColor ? ` · ${ticket.vehicleColor}` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plate</span>
            <span className="font-mono text-xs uppercase">
              {ticket.licensePlate ?? "N/A"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Elapsed</span>
            <span>{ticket.elapsedHours} hrs</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Projected</span>
            <span className="font-semibold text-primary">{projectedAmount}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-medium text-emerald-700">${amountPaid.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Outstanding</span>
            <span className={paymentComplete ? "text-emerald-600" : "text-rose-600"}>
              ${outstandingAmount.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>
            Parked at <span className="font-medium text-foreground">{ticket.parkingLocation ?? "—"}</span>
          </p>
          <p>
            Checked in{" "}
            <span className="font-medium text-foreground">
              {format(new Date(ticket.checkInTime), "MMM d, h:mm a")}
            </span>
          </p>
          <p>
            Last message{" "}
            <span className="font-medium text-foreground">
              {ticket.lastMessageAt
                ? format(new Date(ticket.lastMessageAt), "MMM d, h:mm a")
                : "No messages yet"}
            </span>
          </p>
        </div>

        {ticket.notes ? (
          <div className="max-h-24 overflow-y-auto rounded-md border bg-card/60 p-3 text-xs text-muted-foreground scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted">
            <p className="whitespace-pre-wrap text-foreground">{ticket.notes}</p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 [&>button]:flex-1 [&>button]:text-sm">
          <Button
            variant={ticket.vehicleStatus === "WITH_US" ? "outline" : "secondary"}
            size="sm"
            disabled={isUpdating || requiresPaymentBeforeAway}
            onClick={() =>
              onUpdate(ticket.id, {
                vehicleStatus: ticket.vehicleStatus === "WITH_US" ? "AWAY" : "WITH_US",
              })
            }
          >
            {isUpdating ? (
              <span className="flex items-center gap-1 text-xs">
                <Loader2 className="size-3 animate-spin" />
                Updating…
              </span>
            ) : ticket.vehicleStatus === "WITH_US" ? (
              <>
                <CarFront className="size-4" />
                Mark Away
              </>
            ) : (
              <>
                <CarFront className="size-4" />
                Mark With Us
              </>
            )}
          </Button>
          {requiresPaymentBeforeAway ? (
            <p className="w-full text-xs text-amber-600">
              Balance must be paid before taking the vehicle off-site.
            </p>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPayment(ticket)}
          >
            <CreditCard className="size-4" />
            Payment Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNotify(ticket)}
            disabled={isUpdating || !paymentComplete}
            className={!paymentComplete ? "opacity-70" : undefined}
          >
            <Send className="size-4" />
            Notify
          </Button>
          {!paymentComplete ? (
            <p className="w-full text-xs text-rose-500">
              Payment required before notifying or setting Ready/Completed.
            </p>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" disabled={isUpdating}>
                {isUpdating ? (
                  <span className="flex items-center gap-1 text-xs">
                    <Loader2 className="size-3 animate-spin" />
                    Updating…
                  </span>
                ) : (
                  "Change Status"
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              {statusOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  disabled={
                    option.value === ticket.status ||
                    isUpdating ||
                    (!paymentComplete &&
                      (option.value === "READY_FOR_PICKUP" || option.value === "COMPLETED"))
                  }
                  onClick={() =>
                    onUpdate(ticket.id, {
                      status: option.value,
                    })
                  }
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}


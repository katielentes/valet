"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCcw, Filter } from "lucide-react";
import { format } from "date-fns";

import { useAppShell } from "@/components/layout/app-shell";
import { EditTicketDialog } from "@/components/tickets/edit-ticket-dialog";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { SendMessageDialog } from "@/components/messages/send-message-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTicketsQuery, type Ticket, type TicketFilters } from "@/hooks/use-tickets";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All", status: undefined, vehicleStatus: undefined },
  { id: "ready", label: "Ready", status: "READY_FOR_PICKUP" as const, vehicleStatus: undefined },
  { id: "away", label: "Away", status: undefined, vehicleStatus: "AWAY" as const },
  { id: "with-us", label: "With Us", status: undefined, vehicleStatus: "WITH_US" as const },
];

export default function TicketsPage() {
  const { location } = useAppShell();
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const filters: TicketFilters = useMemo(() => {
    return {
      locationId: location,
      status: activeFilter.status,
      vehicleStatus: activeFilter.vehicleStatus,
    };
  }, [activeFilter, location]);

  const { data, isLoading, error, refetch, isFetching } = useTicketsQuery(filters);
  const [ticketForMessage, setTicketForMessage] = useState<Ticket | null>(null);
  const [ticketForEdit, setTicketForEdit] = useState<Ticket | null>(null);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleOpenSendDialog = (ticket: Ticket) => {
    setTicketForMessage(ticket);
    setMessageDialogOpen(true);
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

      <EditTicketDialog
        ticket={ticketForEdit}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setTicketForEdit(null);
          }
        }}
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

      <MetricsSummary loading={isLoading} metrics={data?.metrics} />

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

      <TicketResults
        loading={isLoading}
        tickets={data?.tickets ?? []}
        onNotify={handleOpenSendDialog}
        onEdit={handleOpenEditDialog}
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
};

function TicketResults({ loading, tickets, onNotify, onEdit }: TicketResultsProps) {
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
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} onNotify={onNotify} onEdit={onEdit} />
      ))}
    </div>
  );
}

type TicketCardProps = {
  ticket: Ticket;
  onNotify: (ticket: Ticket) => void;
  onEdit: (ticket: Ticket) => void;
};

function TicketCard({ ticket, onNotify, onEdit }: TicketCardProps) {
  const projectedAmount = `$${(ticket.projectedAmountCents / 100).toFixed(2)}`;
  const rateBadge =
    ticket.rateType === "OVERNIGHT" ? (
      <Badge variant="secondary" className="gap-1">
        🌙 Overnight
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1">
        ⏱️ Hourly
      </Badge>
    );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{ticket.ticketNumber}</CardTitle>
          {rateBadge}
        </div>
        <CardDescription className="flex items-center justify-between gap-2 text-sm">
          <span>{ticket.customerName}</span>
          <Badge variant="outline" className="capitalize">
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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge
              variant={
                ticket.vehicleStatus === "WITH_US"
                  ? "outline"
                  : ticket.vehicleStatus === "AWAY"
                    ? "secondary"
                    : "outline"
              }
            >
              {ticket.vehicleStatus === "WITH_US" ? "With Us" : "Away"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Elapsed</span>
            <span>{ticket.elapsedHours} hrs</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Projected</span>
            <span className="font-semibold text-primary">{projectedAmount}</span>
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
          <div className="max-h-24 overflow-y-auto rounded-md border bg-card/60 p-3 text-xs text-muted-foreground">
            <p className="whitespace-pre-wrap text-foreground">{ticket.notes}</p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2">
          <Button variant="default" size="sm" className="flex-1" disabled>
            Mark Ready
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onNotify(ticket)}
          >
            Notify Customer
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onEdit(ticket)}>
            Edit Ticket
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


"use client";

import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquare, ArrowUpRight, ArrowDownLeft, Search, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SendMessageDialog } from "@/components/messages/send-message-dialog";
import { useMessagingStatus } from "@/hooks/use-messages";
import type { Ticket } from "@/hooks/use-tickets";

type MessageRecord = {
  id: string;
  ticketId: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  deliveryStatus: "SENT" | "FAILED" | "DELIVERED" | "RECEIVED";
  sentAt: string;
  ticket: {
    id: string;
    ticketNumber: string;
    customerName: string;
    customerPhone: string | null;
    location: {
      id: string;
      name: string;
    };
  };
};

type MessagesResponse = {
  messages: MessageRecord[];
};

export default function MessagesPage() {
  const { location } = useAppShell();
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "INBOUND" | "OUTBOUND">("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const { data: statusData } = useMessagingStatus();
  const isMessagingDisabled = statusData?.disabled ?? false;

  const { data, isLoading, error } = useQuery<MessagesResponse>({
    queryKey: ["messages", location, directionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (location) {
        params.append("locationId", location);
      }
      if (directionFilter !== "all") {
        params.append("direction", directionFilter);
      }
      params.append("limit", "100");

      const response = await fetch(`/api/messages?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load messages");
      }
      return response.json();
    },
    refetchInterval: 1000 * 30, // Refetch every 30 seconds
  });

  const messages = data?.messages ?? [];

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;

    const query = searchQuery.toLowerCase();
    return messages.filter(
      (msg) =>
        msg.body.toLowerCase().includes(query) ||
        msg.ticket.customerName.toLowerCase().includes(query) ||
        msg.ticket.ticketNumber.toLowerCase().includes(query) ||
        (msg.ticket.customerPhone && msg.ticket.customerPhone.includes(query))
    );
  }, [messages, searchQuery]);

  const handleReply = (message: MessageRecord) => {
    // Convert message record to Ticket type for the dialog
    const ticket: Ticket = {
      id: message.ticket.id,
      ticketNumber: message.ticket.ticketNumber,
      customerName: message.ticket.customerName,
      customerPhone: message.ticket.customerPhone ?? "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleColor: "",
      licensePlate: "",
      parkingLocation: "",
      rateType: "HOURLY",
      inOutPrivileges: false,
      status: "CHECKED_IN",
      vehicleStatus: "WITH_US",
      checkInTime: new Date().toISOString(),
      checkOutTime: null,
      location: {
        id: message.ticket.location.id,
        name: message.ticket.location.name,
        identifier: "",
        overnightInOutPrivileges: false,
        pricingTiers: null,
      },
      lastMessageAt: message.sentAt,
      elapsedHours: 0,
      projectedAmountCents: 0,
      paidAmountCents: 0,
      outstandingAmountCents: 0,
      notes: null,
    };
    setSelectedTicket(ticket);
    setMessageDialogOpen(true);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">View and manage customer communications</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Failed to load messages. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SendMessageDialog
        ticket={selectedTicket}
        open={messageDialogOpen}
        onOpenChange={(open) => {
          setMessageDialogOpen(open);
          if (!open) {
            setSelectedTicket(null);
          }
        }}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">View and manage customer communications</p>
      </div>

      {isMessagingDisabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">SMS sending is currently disabled</p>
          <p className="mt-1 text-xs text-amber-700">
            {statusData?.message || "Set DISABLE_SMS_SENDING=false to enable messaging."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search messages, customers, or ticket numbers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as typeof directionFilter)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="mr-2 size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Messages</SelectItem>
            <SelectItem value="INBOUND">Inbound Only</SelectItem>
            <SelectItem value="OUTBOUND">Outbound Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredMessages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="size-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">No messages found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Try adjusting your search" : "Messages will appear here when customers text in"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((message) => (
            <Card key={message.id} className="hover:bg-muted/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={message.direction === "OUTBOUND" ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {message.direction === "OUTBOUND" ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownLeft className="size-3" />
                        )}
                        {message.direction}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {message.ticket.ticketNumber}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {message.ticket.location.name}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{message.ticket.customerName}</CardTitle>
                    <CardDescription className="text-xs">
                      {message.ticket.customerPhone} · {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                    </CardDescription>
                  </div>
                  {message.direction === "INBOUND" && message.ticket.customerPhone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReply(message)}
                      className="gap-2"
                    >
                      <MessageSquare className="size-4" />
                      Reply
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                {message.deliveryStatus === "FAILED" && (
                  <p className="text-xs text-destructive mt-2">Delivery failed</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useUpdateTicketMutation, type Ticket } from "@/hooks/use-tickets";
import { useAppShell } from "@/components/layout/app-shell";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fromDateTimeInput, toDateTimeInputValue } from "@/lib/datetime";

const formSchema = z.object({
  customerName: z.string().min(1, "Enter customer name"),
  customerPhone: z.string().min(5, "Enter phone number"),
  vehicleMake: z.string().min(1, "Enter vehicle make"),
  vehicleModel: z.string().min(1, "Enter vehicle model"),
  vehicleColor: z.string().optional(),
  licensePlate: z.string().optional(),
  parkingLocation: z.string().optional(),
  rateType: z.enum(["HOURLY", "OVERNIGHT"]),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"]),
  vehicleStatus: z.enum(["WITH_US", "AWAY"]),
  locationId: z.string(),
  notes: z.string().optional(),
  checkInTime: z.string(),
  durationDays: z.number().int().positive().nullable().optional(),
  durationHours: z.number().int().positive().nullable().optional(),
});

type EditTicketDialogProps = {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (ticket: Ticket) => void;
  canDelete?: boolean;
};

export function EditTicketDialog({ ticket, open, onOpenChange, onDelete, canDelete }: EditTicketDialogProps) {
  const updateTicket = useUpdateTicketMutation();
  const { locations, locationsLoading, role } = useAppShell();
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);

  const locationOptions = useMemo(
    () => locations.map((loc) => ({ value: loc.id, label: loc.name })),
    [locations]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: ticket
      ? mapTicketToForm(ticket)
      : {
          customerName: "",
          customerPhone: "",
          vehicleMake: "",
          vehicleModel: "",
          vehicleColor: "",
          licensePlate: "",
          parkingLocation: "",
          rateType: "HOURLY",
          status: "CHECKED_IN",
          vehicleStatus: "WITH_US",
          locationId: "",
          notes: "",
          checkInTime: toDateTimeInputValue(new Date()),
        },
  });

  useEffect(() => {
    if (ticket) {
      form.reset(mapTicketToForm(ticket));
    }
  }, [ticket, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!ticket) return;
    setFeedback(null);
    try {
      await updateTicket.mutateAsync({
        id: ticket.id,
        data: {
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          vehicleMake: values.vehicleMake,
          vehicleModel: values.vehicleModel,
          vehicleColor: values.vehicleColor || null,
          licensePlate: values.licensePlate || null,
          parkingLocation: values.parkingLocation || null,
          rateType: values.rateType,
          status: values.status,
          vehicleStatus: values.vehicleStatus,
          locationId: values.locationId,
          notes: values.notes ?? null,
          checkInTime: fromDateTimeInput(values.checkInTime) ?? undefined,
          durationDays: values.durationDays ?? null,
          durationHours: values.durationHours ?? null,
        },
      });
      toast.success(`Ticket ${ticket.ticketNumber} updated`);
      handleDialogOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update ticket.",
      });
    }
  });

  const handleDialogOpenChange = (value: boolean) => {
    if (!value) {
      setFeedback(null);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-3xl flex-col overflow-hidden p-0 sm:p-0">
        <div className="sticky top-0 z-10 border-b bg-card/95 px-6 pb-4 pt-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold">Edit ticket</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                Update ticket details. Changes are logged to the audit trail.
              </DialogDescription>
            </div>
            {canDelete && ticket && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  onDelete(ticket);
                  onOpenChange(false);
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label="Delete ticket"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <Form {...form}>
          <form
            className="flex-1 overflow-y-auto px-6 pb-32 pt-6 [scrollbar-width:thin]"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jordan Price" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer phone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="3125550100"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, ""); // Remove non-digits
                          // Auto-prefix with "1" if it doesn't start with "1" and has digits
                          if (value.length > 0 && !value.startsWith("1")) {
                            value = "1" + value;
                          }
                          // Format as +1XXXXXXXXXX (max 11 digits: 1 + 10)
                          if (value.length > 11) {
                            value = value.slice(0, 11);
                          }
                          // Format with + prefix
                          const formatted = value.length > 0 ? `+${value}` : "";
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleMake"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle make</FormLabel>
                    <FormControl>
                      <Input placeholder="Tesla" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle model</FormLabel>
                    <FormControl>
                      <Input placeholder="Model 3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle color</FormLabel>
                    <FormControl>
                      <Input placeholder="Blue" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="licensePlate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License plate</FormLabel>
                    <FormControl>
                      <Input placeholder="IL-VAL100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parkingLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parking location</FormLabel>
                    <FormControl>
                      <Input placeholder="Deck A - Spot 12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned location</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={locationsLoading || role === "STAFF"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="rateType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rate type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOURLY">Hourly</SelectItem>
                        <SelectItem value="OVERNIGHT">Overnight</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticket status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CHECKED_IN">Checked in</SelectItem>
                        <SelectItem value="READY_FOR_PICKUP">Ready for pickup</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WITH_US">With us</SelectItem>
                        <SelectItem value="AWAY">Away</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {form.watch("rateType") === "OVERNIGHT" && (
              <FormField
                control={form.control}
                name="durationDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (days) - Optional</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 3"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? null : parseInt(value, 10));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Enter the number of days for prepaid overnight parking
                    </p>
                  </FormItem>
                )}
              />
            )}

            {form.watch("rateType") === "HOURLY" && (
              <FormField
                control={form.control}
                name="durationHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (hours) - Optional</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 5"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === "" ? null : parseInt(value, 10));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Enter the number of hours for prepaid hourly parking
                    </p>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="checkInTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Check-in time</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Additional valet notes…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          {feedback ? (
            <div
              className={cn(
                "w-full rounded-md border px-3 py-2 text-xs text-destructive md:w-auto md:text-sm",
                "border-destructive/40 bg-destructive/10"
              )}
            >
              {feedback.message}
            </div>
          ) : null}

          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={updateTicket.isPending || locationsLoading}
              className="gap-2"
            >
              {updateTicket.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mapTicketToForm(ticket: Ticket): z.infer<typeof formSchema> {
  return {
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    vehicleMake: ticket.vehicleMake,
    vehicleModel: ticket.vehicleModel,
    vehicleColor: ticket.vehicleColor ?? "",
    licensePlate: ticket.licensePlate ?? "",
    parkingLocation: ticket.parkingLocation ?? "",
    rateType: ticket.rateType,
    status: ticket.status,
    vehicleStatus: ticket.vehicleStatus,
    locationId: ticket.location.id,
    notes: ticket.notes ?? "",
    checkInTime: toDateTimeInputValue(ticket.checkInTime),
    durationDays: ticket.durationDays,
    durationHours: ticket.durationHours,
  };
}


"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAppShell } from "@/components/layout/app-shell";
import { useCreateTicketMutation } from "@/hooks/use-tickets";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fromDateTimeInput, toDateTimeInputValue } from "@/lib/datetime";

const formSchema = z.object({
  ticketNumber: z.string().min(1, "Ticket number required"),
  customerName: z.string().min(1, "Customer name required"),
  customerPhone: z.string().min(5, "Customer phone required"),
  vehicleMake: z.string().min(1, "Vehicle make required"),
  vehicleModel: z.string().min(1, "Vehicle model required"),
  vehicleColor: z.string().optional(),
  licensePlate: z.string().optional(),
  parkingLocation: z.string().optional(),
  locationId: z.string().min(1, "Select a location"),
  rateType: z.enum(["HOURLY", "OVERNIGHT"]),
  inOutPrivileges: z.enum(["yes", "no"]),
  status: z.enum(["CHECKED_IN", "READY_FOR_PICKUP"]),
  notes: z.string().optional(),
  checkInTime: z.string(),
});

type NewTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewTicketDialog({ open, onOpenChange }: NewTicketDialogProps) {
  const { locations, locationsLoading, location: currentLocation } = useAppShell();
  const createTicket = useCreateTicketMutation();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const locationOptions = useMemo(
    () => locations.map((loc) => ({ value: loc.id, label: loc.name })),
    [locations]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ticketNumber: "",
      customerName: "",
      customerPhone: "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleColor: "",
      licensePlate: "",
      parkingLocation: "",
      locationId: "",
      rateType: "HOURLY",
      inOutPrivileges: "no",
      status: "CHECKED_IN",
      notes: "",
      checkInTime: toDateTimeInputValue(new Date()),
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      ticketNumber: "",
      customerName: "",
      customerPhone: "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleColor: "",
      licensePlate: "",
      parkingLocation: "",
      locationId:
        currentLocation !== "all" && locations.some((loc) => loc.id === currentLocation)
          ? currentLocation
          : "",
      rateType: "HOURLY",
      inOutPrivileges: "no",
      status: "CHECKED_IN",
      notes: "",
      checkInTime: toDateTimeInputValue(new Date()),
    });
  }, [open, currentLocation, locations, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFeedback(null);
    try {
      await createTicket.mutateAsync({
        ticketNumber: values.ticketNumber,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        vehicleMake: values.vehicleMake,
        vehicleModel: values.vehicleModel,
        vehicleColor: values.vehicleColor || null,
        licensePlate: values.licensePlate || null,
        parkingLocation: values.parkingLocation || null,
        locationId: values.locationId,
        rateType: values.rateType,
        inOutPrivileges: values.inOutPrivileges === "yes",
        status: values.status,
        vehicleStatus: "WITH_US",
      notes: values.notes || null,
      checkInTime: fromDateTimeInput(values.checkInTime) ?? new Date().toISOString(),
      });
      setFeedback({ type: "success", message: "Ticket created." });
      onOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to create ticket.",
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>Capture customer and vehicle details to create a valet ticket.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="ticketNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticket number</FormLabel>
                    <FormControl>
                      <Input placeholder="HAMP-2045" {...field} />
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
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value} disabled={locationsLoading}>
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
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      <Input placeholder="+13125550100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="vehicleMake"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle make</FormLabel>
                    <FormControl>
                      <Input placeholder="BMW" {...field} />
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
                      <Input placeholder="X5" {...field} />
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
                      <Input placeholder="Black" {...field} />
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
                      <Input placeholder="IL-VAL200" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="parkingLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parking location</FormLabel>
                    <FormControl>
                      <Input placeholder="Tower B - Spot 8" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                name="inOutPrivileges"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>In/out privileges</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                    <Textarea rows={3} placeholder="Special requests, damage notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        {feedback ? (
          <div
            className={cn(
              "rounded-md border p-2 text-sm",
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            {feedback.message}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={createTicket.isPending || locationsLoading}
            className="gap-2"
          >
            {createTicket.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create ticket"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useUpdateLocationMutation, type LocationRecord, type PricingTier } from "@/hooks/use-locations";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const pricingTierSchema = z.object({
  maxHours: z
    .number()
    .int("Max hours must be a whole number")
    .min(1, "Max hours must be at least 1")
    .nullable(),
  rateCents: z
    .number()
    .int("Rate must be a whole number")
    .min(0, "Rate cannot be negative"),
  inOutPrivileges: z.boolean().default(false),
});

const locationFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name must be 120 characters or less"),
  taxRateBasisPoints: z
    .number()
    .int("Tax rate must be a whole number")
    .min(0, "Tax rate cannot be negative")
    .max(10000, "Tax rate cannot exceed 100%"),
  hotelSharePoints: z
    .number()
    .int("Hotel share must be a whole number")
    .min(0, "Hotel share cannot be negative")
    .max(10000, "Hotel share cannot exceed 100%"),
  overnightRateCents: z
    .number()
    .int("Overnight rate must be a whole number")
    .min(0, "Overnight rate cannot be negative"),
  overnightInOutPrivileges: z.boolean().default(true),
  pricingTiers: z.array(pricingTierSchema).optional(),
});

type EditLocationDialogProps = {
  location: LocationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditLocationDialog({ location, open, onOpenChange }: EditLocationDialogProps) {
  const updateLocation = useUpdateLocationMutation();
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);

  const form = useForm<z.infer<typeof locationFormSchema>>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: "",
      taxRateBasisPoints: 0,
      hotelSharePoints: 0,
      overnightRateCents: 0,
      overnightInOutPrivileges: true,
      pricingTiers: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "pricingTiers",
  });

  useEffect(() => {
    if (location && open) {
      // Initialize pricing tiers from location or create empty array
      const initialTiers: PricingTier[] = location.pricingTiers ?? [];
      
      form.reset({
        name: location.name,
        taxRateBasisPoints: location.taxRateBasisPoints,
        hotelSharePoints: location.hotelSharePoints,
        overnightRateCents: location.overnightRateCents,
        overnightInOutPrivileges: location.overnightInOutPrivileges ?? true,
        pricingTiers: initialTiers.length > 0 ? initialTiers : [],
      });
    }
  }, [location, open, form]);

  // Reset feedback when dialog opens (separate effect to avoid React warning)
  useEffect(() => {
    if (open) {
      setFeedback(null);
    }
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!location) return;

    setFeedback(null);
    try {
      // Validate tiers are in ascending order by maxHours
      if (values.pricingTiers && values.pricingTiers.length > 0) {
        const sortedTiers = [...values.pricingTiers].sort((a, b) => {
          if (a.maxHours === null) return 1; // null (unlimited) goes last
          if (b.maxHours === null) return -1;
          return a.maxHours - b.maxHours;
        });

        // Check if sorted order matches current order
        const isOrdered = sortedTiers.every((tier, index) => {
          const current = values.pricingTiers![index];
          return tier.maxHours === current.maxHours && tier.rateCents === current.rateCents;
        });

        if (!isOrdered) {
          setFeedback({
            type: "error",
            message: "Pricing tiers must be in ascending order by hours (lowest to highest).",
          });
          return;
        }

        // Ensure no duplicate maxHours (except null)
        const maxHoursSet = new Set<number | null>();
        for (const tier of values.pricingTiers) {
          if (maxHoursSet.has(tier.maxHours)) {
            setFeedback({
              type: "error",
              message: "Each tier must have a unique maximum hours value.",
            });
            return;
          }
          maxHoursSet.add(tier.maxHours);
        }
      }

      await updateLocation.mutateAsync({
        locationId: location.id,
        ...values,
        pricingTiers: values.pricingTiers && values.pricingTiers.length > 0 ? values.pricingTiers : undefined,
      });

      toast.success("Location settings updated successfully");
      onOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update location.",
      });
    }
  });

  if (!location) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Location Settings</DialogTitle>
          <DialogDescription>
            Update pricing, tax rates, and hotel revenue sharing for {location.name}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
            {feedback && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {feedback.message}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Hampton Inn" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Pricing Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <FormLabel>Pricing Tiers</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ maxHours: null, rateCents: 0, inOutPrivileges: false })}
                      className="gap-2"
                    >
                      <Plus className="size-4" />
                      Add Tier
                    </Button>
                  </div>
                  <FormDescription className="mb-3">
                    Define multiple pricing tiers. Tiers must be in ascending order by hours. Leave max hours empty for the final tier (overnight rate). Enable "In/Out Privileges" for tiers that allow customers to take their vehicle out and return without closing the ticket.
                  </FormDescription>

                  {fields.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No pricing tiers configured. Click "Add Tier" to create one.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex items-start gap-2 rounded-md border p-3">
                          <div className="flex-1 grid gap-3 sm:grid-cols-2">
                            <FormField
                              control={form.control}
                              name={`pricingTiers.${index}.maxHours`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Max Hours</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="1"
                                      min="1"
                                      placeholder="Leave empty for final tier"
                                      {...field}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        field.onChange(val === "" ? null : (parseInt(val) || null));
                                      }}
                                      value={field.value === null ? "" : String(field.value ?? "")}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`pricingTiers.${index}.rateCents`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Rate (cents)</FormLabel>
                                  <FormControl>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                      placeholder="2000"
                                      {...field}
                                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                      value={String(field.value ?? 0)}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`pricingTiers.${index}.inOutPrivileges`}
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 sm:col-span-2">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value ?? false}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel>In/Out Privileges</FormLabel>
                                    <FormDescription>
                                      Allow customers to take their vehicle out and return without closing the ticket. Staff should set tickets with this rate to "Overnight" rate type.
                                    </FormDescription>
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => remove(index)}
                            className="mt-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="overnightRateCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overnight Rate (cents)</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            placeholder="4600"
                            {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value ?? 0}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Overnight rate in cents (e.g., 4600 = $46.00). Used when hours exceed the final tier or for overnight tickets.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="overnightInOutPrivileges"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Overnight In/Out Privileges</FormLabel>
                        <FormDescription>
                          Allow customers with overnight rate tickets to take their vehicle out and return without closing the ticket.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Financial Settings</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="taxRateBasisPoints"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Rate (basis points)</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              max="10000"
                              placeholder="2325"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value ?? 0}
                            />
                          <span className="text-sm text-muted-foreground">bp</span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Tax rate in basis points (e.g., 2325 = 23.25%)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hotelSharePoints"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hotel Share (basis points)</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            max="10000"
                            placeholder="500"
                            {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value ?? 0}
                          />
                          <span className="text-sm text-muted-foreground">bp</span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Hotel revenue share in basis points (e.g., 500 = 5.00%)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 bg-background border-t pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={updateLocation.isPending}
                className="gap-2"
              >
                {updateLocation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


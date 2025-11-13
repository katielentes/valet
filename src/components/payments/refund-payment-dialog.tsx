"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useRefundPaymentMutation, type PaymentRecord } from "@/hooks/use-payments";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const refundFormSchema = z.object({
  refundType: z.enum(["full", "partial"]),
  amountCents: z.coerce.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

type RefundPaymentDialogProps = {
  payment: PaymentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function RefundPaymentDialog({ payment, open, onOpenChange }: RefundPaymentDialogProps) {
  const refundPayment = useRefundPaymentMutation();
  const [feedback, setFeedback] = useState<{ type: "error"; message: string } | null>(null);

  const form = useForm<z.infer<typeof refundFormSchema>>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: {
      refundType: "full",
      amountCents: undefined,
      reason: "",
    },
  });

  const refundType = form.watch("refundType");

  useEffect(() => {
    if (payment && open) {
      const alreadyRefunded = payment.refundAmountCents ?? 0;
      const remaining = payment.amountCents - alreadyRefunded;
      form.reset({
        refundType: "full",
        amountCents: remaining,
        reason: "",
      });
      setFeedback(null);
    }
  }, [payment, open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!payment) return;

    setFeedback(null);
    try {
      const refundAmountCents =
        values.refundType === "full" ? undefined : values.amountCents;

      await refundPayment.mutateAsync({
        paymentId: payment.id,
        amountCents: refundAmountCents,
        reason: values.reason || undefined,
      });

      toast.success(
        `Refund processed: ${currencyFormatter.format(
          (refundAmountCents ?? payment.amountCents - (payment.refundAmountCents ?? 0)) / 100
        )}`
      );
      onOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to process refund.",
      });
    }
  });

  if (!payment) return null;

  const alreadyRefunded = payment.refundAmountCents ?? 0;
  const remainingRefundable = payment.amountCents - alreadyRefunded;
  const isFullyRefunded = alreadyRefunded >= payment.amountCents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund Payment</DialogTitle>
          <DialogDescription>
            Process a full or partial refund for this payment. The refund will be synced to Stripe.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            {feedback && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            )}

            {isFullyRefunded && (
              <Alert>
                <AlertTitle>Already Refunded</AlertTitle>
                <AlertDescription>
                  This payment has already been fully refunded.
                </AlertDescription>
              </Alert>
            )}

            {!isFullyRefunded && (
              <>
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Original Amount</span>
                    <span className="font-semibold">
                      {currencyFormatter.format(payment.amountCents / 100)}
                    </span>
                  </div>
                  {alreadyRefunded > 0 && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Already Refunded</span>
                      <span className="font-medium text-rose-600">
                        -{currencyFormatter.format(alreadyRefunded / 100)}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between border-t pt-2">
                    <span className="font-medium">Remaining Refundable</span>
                    <span className="font-semibold text-emerald-600">
                      {currencyFormatter.format(remainingRefundable / 100)}
                    </span>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="refundType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Refund Type</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={field.value === "full" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => {
                              field.onChange("full");
                              form.setValue("amountCents", remainingRefundable);
                            }}
                          >
                            Full Refund
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "partial" ? "default" : "outline"}
                            className="flex-1"
                            onClick={() => field.onChange("partial")}
                          >
                            Partial Refund
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {refundType === "partial" && (
                  <FormField
                    control={form.control}
                    name="amountCents"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refund Amount</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">$</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={remainingRefundable / 100}
                              placeholder={(remainingRefundable / 100).toFixed(2)}
                              {...field}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                field.onChange(value ? Math.round(value * 100) : undefined);
                              }}
                              value={field.value ? (field.value / 100).toFixed(2) : ""}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Maximum: {currencyFormatter.format(remainingRefundable / 100)}
                        </p>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Customer requested refund due to..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {!isFullyRefunded && (
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={refundPayment.isPending}
                  className="gap-2"
                >
                  {refundPayment.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Process Refund"
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


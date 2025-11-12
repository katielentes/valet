"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useCreatePaymentLinkMutation } from "@/hooks/use-payments";
import type { Ticket } from "@/hooks/use-tickets";
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
import { Textarea } from "@/components/ui/textarea";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  message: z.string().optional(),
});

type SendPaymentLinkDialogProps = {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SendPaymentLinkDialog({ ticket, open, onOpenChange }: SendPaymentLinkDialogProps) {
  const createLink = useCreatePaymentLinkMutation();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
    },
  });

  const baseAmountCents = ticket?.projectedAmountCents ?? 0;

  const messagePreview = useWatch({
    control: form.control,
    name: "message",
  });

  const totalCents = baseAmountCents;
  const totalDisplay = (totalCents / 100).toFixed(2);
  const baseDisplay = (baseAmountCents / 100).toFixed(2);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!ticket) return;
    setFeedback(null);
    try {
      await createLink.mutateAsync({
        ticketId: ticket.id,
        message: values.message?.trim() ? values.message.trim() : undefined,
      });
      setFeedback({ type: "success", message: "Payment link sent to customer." });
      onOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to send payment link.",
      });
    }
  });

  const disabled = createLink.isPending || !ticket;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send payment link</DialogTitle>
          <DialogDescription>
            Text a secure Stripe payment link with the exact amount due, plus an optional tip.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Ticket</span>
            <span className="font-medium">{ticket?.ticketNumber}</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span>{ticket?.customerName}</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Base amount</span>
            <span>${baseDisplay}</span>
          </p>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="flex items-center justify-between text-sm font-medium text-foreground">
                <span>Total to charge</span>
                <span>${totalDisplay}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                The customer will see this total when opening the payment link.
              </p>
            </div>

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom message (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Thanks for parking with us! Here is the link to pay for your valet service."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <div className="rounded-md border border-muted-foreground/20 bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Preview</p>
          <p className="whitespace-pre-wrap text-foreground">
            {messagePreview?.trim()
              ? `${messagePreview.trim()}\nTotal due: $${totalDisplay}\nPay here: https://…`
              : `ValetPro: Your total is $${totalDisplay}. Pay here: https://…`}
          </p>
          <p className="mt-1 text-muted-foreground">
            The actual message will include the live payment link URL.
          </p>
        </div>

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
            onClick={handleSubmit}
            disabled={disabled || totalCents <= 0}
            className="gap-2"
          >
            {createLink.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send payment link"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


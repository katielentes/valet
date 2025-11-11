"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { useSendMessage, useMessageTemplates, useMessages } from "@/hooks/use-messages";
import type { Ticket } from "@/hooks/use-tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";

const formSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(500),
});

type SendMessageDialogProps = {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SendMessageDialog({ ticket, open, onOpenChange }: SendMessageDialogProps) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const sendMessage = useSendMessage();
  const { data: templateData } = useMessageTemplates();
  const { data: messageData, isLoading: messagesLoading } = useMessages(ticket?.id ?? null);

  const templates = templateData?.templates ?? [];
  const recentMessages = messageData?.messages ?? [];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { body: "" },
  });

  const suggestedTemplates = templates.slice(0, 3);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!ticket) return;
    setFeedback(null);
    try {
      await sendMessage.mutateAsync({
        ticketId: ticket.id,
        body: values.body,
      });
      setFeedback({ type: "success", message: "Message sent successfully." });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to send message.",
      });
    }
  });

  const disabled = sendMessage.isPending || !ticket;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send message</DialogTitle>
          <DialogDescription>
            Send a text message to {ticket?.customerName} ({ticket?.customerPhone}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p>
              <span className="font-medium">Vehicle:</span> {ticket?.vehicleMake} {ticket?.vehicleModel}{" "}
              {ticket?.vehicleColor ? `· ${ticket.vehicleColor}` : ""}
            </p>
            <p>
              <span className="font-medium">Ticket:</span> {ticket?.ticketNumber}
            </p>
            <p>
              <span className="font-medium">Status:</span>{" "}
              <Badge variant="outline" className="capitalize">
                {ticket?.status.toLowerCase()}
              </Badge>
            </p>
          </div>

          {templates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Templates</p>
              <div className="flex flex-wrap gap-2">
                {suggestedTemplates.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => form.setValue("body", template.body)}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <Form {...form}>
            <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Type your message..."
                        rows={4}
                        {...field}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>

          <div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Recent messages</span>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => form.reset()}>
                Clear message
              </Button>
            </div>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto border rounded-md p-3 text-sm">
              {messagesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading history…
                </div>
              ) : recentMessages.length === 0 ? (
                <p className="text-muted-foreground">No messages yet.</p>
              ) : (
                recentMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-md border p-2",
                      message.direction === "OUTBOUND"
                        ? "border-primary/30 bg-primary/5"
                        : "border-muted-foreground/20 bg-muted/20"
                    )}
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="uppercase">{message.direction}</span>
                      <span>{formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{message.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
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
            disabled={disabled}
            className="gap-2"
          >
            {sendMessage.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send SMS"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type MessageRecord = {
  id: string;
  ticketId: string;
  tenantId: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  deliveryStatus: "SENT" | "FAILED" | "DELIVERED" | "RECEIVED";
  sentAt: string;
};

type TemplateRecord = {
  id: string;
  name: string;
  body: string;
};

export function useMessageTemplates() {
  return useQuery<{ templates: TemplateRecord[] }>({
    queryKey: ["messageTemplates"],
    queryFn: async () => {
      const response = await fetch("/api/messages/templates", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load templates");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useMessages(ticketId: string | null) {
  return useQuery<{ messages: MessageRecord[] }>({
    queryKey: ["messages", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const response = await fetch(`/api/messages?ticketId=${ticketId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load messages");
      }
      return response.json();
    },
    refetchInterval: 1000 * 30,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ticketId: string; body: string }) => {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to send message");
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["messages", variables.ticketId] });
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; body: string }) => {
      const response = await fetch("/api/messages/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create template");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; body?: string }) => {
      const response = await fetch(`/api/messages/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to update template");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/messages/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error ?? "Failed to delete template");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messageTemplates"] });
    },
  });
}


"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSession, loginUser, logoutUser, type SessionPayload } from "@/lib/api";

export const SESSION_QUERY_KEY = ["session"];

export function useSessionQuery() {
  return useQuery<SessionPayload | null, Error>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    retry: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, data);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}


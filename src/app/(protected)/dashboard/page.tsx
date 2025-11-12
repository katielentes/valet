"use client";

import { useSessionQuery, useLogoutMutation } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { data } = useSessionQuery();
  const logoutMutation = useLogoutMutation();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logoutMutation.mutateAsync();
      window.location.href = "/login";
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    }
  };

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back, {data.user.name}!</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re viewing the {data.tenant.name} operations dashboard.
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Signing out…
            </span>
          ) : (
            "Sign out"
          )}
        </Button>
      </div>

      {logoutError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {logoutError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your current access details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{data.user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Role</span>
              <Badge variant="outline" className="uppercase">
                {data.user.role}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tenant ID</span>
              <span className="font-mono text-xs">{data.user.tenantId}</span>
            </div>
            {data.user.location ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned Location</span>
                <Badge variant="outline" className="capitalize">
                  {data.user.location.name}
                </Badge>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Session expires</span>
              <span>{new Date(data.expiresAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Upcoming implementation tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>• Build the active tickets view with live pricing and messaging controls.</p>
            <p>• Surface payments and projected revenue insights in the reports module.</p>
            <p>• Connect SMS and Stripe integrations for end-to-end workflows.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


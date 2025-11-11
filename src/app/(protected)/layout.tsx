"use client";

import { ReactNode, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

import { useSessionQuery } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, error } = useSessionQuery();

  useEffect(() => {
    if (!isLoading && (!data || error)) {
      const redirectTo = pathname === "/" ? "/dashboard" : pathname;
      router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    }
  }, [data, error, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Checking session…</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return <AppShell session={data}>{children}</AppShell>;
}


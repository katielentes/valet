"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      expand
      toastOptions={{
        className: "border bg-card text-card-foreground shadow-lg",
      }}
    />
  );
}



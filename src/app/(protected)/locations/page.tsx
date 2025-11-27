"use client";

import { useState } from "react";
import { Building2, Edit, Loader2, DollarSign, Percent, Clock, Plus } from "lucide-react";

import { useAppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocations, useUpdateLocationMutation, type LocationRecord } from "@/hooks/use-locations";
import { EditLocationDialog } from "@/components/locations/edit-location-dialog";
import { toast } from "sonner";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function LocationsPage() {
  const { session } = useAppShell();
  const { data, isLoading, error } = useLocations();
  const [locationForEdit, setLocationForEdit] = useState<LocationRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const locations = data?.locations ?? [];
  const canEdit = session.user.role === "ADMIN" || session.user.role === "MANAGER";

  const handleOpenEditDialog = (location: LocationRecord) => {
    setLocationForEdit(location);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
          <p className="text-sm text-muted-foreground">
            Manage location settings, pricing, tax rates, and hotel revenue sharing.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => {
            setLocationForEdit(null);
            setEditDialogOpen(true);
          }}>
            <Plus className="mr-2 size-4" />
            Create Location
          </Button>
        )}
      </div>

      {!canEdit && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-lg text-amber-900">Read-Only Access</CardTitle>
            <CardDescription className="text-amber-700">
              You have read-only access to location settings. Only managers and admins can make changes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load locations right now. Please try again shortly.
        </div>
      ) : null}

      <EditLocationDialog
        location={locationForEdit}
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setLocationForEdit(null);
          }
        }}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">No locations found</CardTitle>
            <CardDescription>
              Locations will appear here once they are created for your tenant.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onEdit={canEdit ? handleOpenEditDialog : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LocationCard({
  location,
  onEdit,
}: {
  location: LocationRecord;
  onEdit?: (location: LocationRecord) => void;
}) {
  const taxRate = location.taxRateBasisPoints / 100;
  const hotelShare = location.hotelSharePoints / 100;
  const overnightRate = location.overnightRateCents / 100;
  const hasTiers = location.pricingTiers && location.pricingTiers.length > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{location.name}</CardTitle>
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(location)}
              className="gap-2"
            >
              <Edit className="size-4" />
              Edit
            </Button>
          )}
        </div>
        <CardDescription className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {location.identifier}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Pricing</p>
          {hasTiers ? (
            <div className="space-y-2">
              {location.pricingTiers!.map((tier, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="size-3" />
                    {tier.maxHours === null ? "Overnight" : `Up to ${tier.maxHours}h`}
                  </span>
                  <span className="font-semibold">
                    {currencyFormatter.format(tier.rateCents / 100)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 mt-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="size-3" />
                  Overnight Rate
                </span>
                <span className="font-semibold">{currencyFormatter.format(overnightRate)}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="size-3" />
                  Overnight Rate
                </span>
                <span className="font-semibold">{currencyFormatter.format(overnightRate)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                No pricing tiers configured. Add tiers to set up custom pricing.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Financial Settings</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Percent className="size-3" />
                Tax Rate
              </span>
              <span className="font-semibold">{percentFormatter.format(taxRate / 100)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-3" />
                Hotel Share
              </span>
              <span className="font-semibold">{percentFormatter.format(hotelShare / 100)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


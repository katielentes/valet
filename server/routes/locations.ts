import { Router } from "express";
import { z } from "zod";

import prisma from "../lib/prisma";
import { Prisma } from "../../src/generated/prisma/client";
import { resolveSession } from "../lib/session";
import { UserRole } from "../../src/generated/prisma/client";

export function registerLocationRoutes(router: Router) {
  router.get("/api/locations", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      if (session.user.role === "STAFF") {
        if (!session.user.locationId) {
          res.status(403).json({ error: "User is not assigned to a location" });
          return;
        }

        const location = await prisma.location.findFirst({
          where: { tenantId: session.tenantId, id: session.user.locationId },
        });

        res.json({
          locations: location
            ? [
                {
                  id: location.id,
                  name: location.name,
                  identifier: location.identifier,
                  taxRateBasisPoints: location.taxRateBasisPoints,
                  hotelSharePoints: location.hotelSharePoints,
                  overnightRateCents: location.overnightRateCents,
                  overnightInOutPrivileges: location.overnightInOutPrivileges,
                  pricingTiers: (location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
                },
              ]
            : [],
        });
        return;
      }

      const locations = await prisma.location.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: "asc" },
      });

      res.json({
        locations: locations.map((location) => ({
          id: location.id,
          name: location.name,
          identifier: location.identifier,
          taxRateBasisPoints: location.taxRateBasisPoints,
          hotelSharePoints: location.hotelSharePoints,
          overnightRateCents: location.overnightRateCents,
          overnightInOutPrivileges: location.overnightInOutPrivileges,
          pricingTiers: (location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        })),
      });
    } catch (error) {
      console.error("Failed to load locations", error);
      res.status(500).json({ error: "Unable to load locations" });
    }
  });

  const pricingTierSchema = z.object({
    maxHours: z.number().int().min(1).nullable(),
    rateCents: z.number().int().min(0),
    inOutPrivileges: z.boolean().optional().default(false),
  });

  const createLocationSchema = z.object({
    name: z.string().min(1).max(120),
    identifier: z.string().min(1).max(50),
    taxRateBasisPoints: z.number().int().min(0).max(10000).default(0), // 0-100% in basis points
    hotelSharePoints: z.number().int().min(0).max(10000).default(0), // 0-100% in basis points
    overnightRateCents: z.number().int().min(0).default(0),
    overnightInOutPrivileges: z.boolean().default(true),
    pricingTiers: z.array(pricingTierSchema).optional().default([]),
  });

  const updateLocationSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    taxRateBasisPoints: z.number().int().min(0).max(10000).optional(), // 0-100% in basis points
    hotelSharePoints: z.number().int().min(0).max(10000).optional(), // 0-100% in basis points
    overnightRateCents: z.number().int().min(0).optional(),
    overnightInOutPrivileges: z.boolean().optional(),
    pricingTiers: z.array(pricingTierSchema).optional(),
  });

  router.post("/api/locations", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Only managers and admins can create locations
    if (session.user.role !== UserRole.MANAGER && session.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Only managers and admins can create locations" });
      return;
    }

    const parsed = createLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid location data", details: parsed.error.errors });
      return;
    }

    const locationData = parsed.data;

    try {
      // Check if identifier already exists for this tenant
      const existingLocation = await prisma.location.findFirst({
        where: {
          identifier: locationData.identifier,
          tenantId: session.tenantId,
        },
      });

      if (existingLocation) {
        res.status(409).json({ error: "A location with this identifier already exists" });
        return;
      }

      const createData: Record<string, unknown> = {
        tenantId: session.tenantId,
        name: locationData.name,
        identifier: locationData.identifier,
        taxRateBasisPoints: locationData.taxRateBasisPoints,
        hotelSharePoints: locationData.hotelSharePoints,
        overnightRateCents: locationData.overnightRateCents,
        overnightInOutPrivileges: locationData.overnightInOutPrivileges,
      };

      // Convert pricingTiers to Prisma JSON format if provided
      if (locationData.pricingTiers !== undefined) {
        createData.pricingTiers = locationData.pricingTiers as Prisma.InputJsonValue;
      }

      const newLocation = await prisma.location.create({
        data: createData,
      });

      // Create audit log entry
      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          ticketId: null,
          userId: session.userId ?? null,
          action: "LOCATION_CREATED",
          details: {
            locationId: newLocation.id,
            locationName: newLocation.name,
            locationIdentifier: newLocation.identifier,
          } as Prisma.InputJsonValue,
        },
      });

      res.json({
        location: {
          id: newLocation.id,
          name: newLocation.name,
          identifier: newLocation.identifier,
          taxRateBasisPoints: newLocation.taxRateBasisPoints,
          hotelSharePoints: newLocation.hotelSharePoints,
          overnightRateCents: newLocation.overnightRateCents,
          overnightInOutPrivileges: newLocation.overnightInOutPrivileges,
          pricingTiers: (newLocation.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      });
    } catch (error) {
      console.error("Failed to create location", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  router.patch("/api/locations/:id", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Only managers and admins can update locations
    if (session.user.role !== UserRole.MANAGER && session.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Only managers and admins can update location settings" });
      return;
    }

    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid update payload" });
      return;
    }

    const locationId = req.params.id;
    const updates = parsed.data;

    try {
      // Verify location belongs to tenant
      const existingLocation = await prisma.location.findFirst({
        where: {
          id: locationId,
          tenantId: session.tenantId,
        },
      });

      if (!existingLocation) {
        res.status(404).json({ error: "Location not found" });
        return;
      }

      const updateData: Record<string, unknown> = { ...updates };
      
      // Convert pricingTiers to Prisma JSON format if provided
      if (updates.pricingTiers !== undefined) {
        updateData.pricingTiers = updates.pricingTiers as Prisma.InputJsonValue;
      }

      const updatedLocation = await prisma.location.update({
        where: { id: locationId },
        data: updateData,
      });

      // Create audit log entry
      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          ticketId: null, // Location updates don't have a ticket
          userId: session.userId ?? null,
          action: "LOCATION_UPDATED",
          details: {
            locationId: updatedLocation.id,
            locationName: updatedLocation.name,
            changes: Object.keys(updates).reduce((acc, key) => {
              const typedKey = key as keyof typeof updates;
              acc[typedKey] = {
                from: existingLocation[typedKey],
                to: updates[typedKey],
              };
              return acc;
            }, {} as Record<string, { from: unknown; to: unknown }>),
          } as Prisma.InputJsonValue,
        },
      });

      res.json({
        location: {
          id: updatedLocation.id,
          name: updatedLocation.name,
          identifier: updatedLocation.identifier,
          taxRateBasisPoints: updatedLocation.taxRateBasisPoints,
          hotelSharePoints: updatedLocation.hotelSharePoints,
          overnightRateCents: updatedLocation.overnightRateCents,
          overnightInOutPrivileges: updatedLocation.overnightInOutPrivileges,
          pricingTiers: (updatedLocation.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null) ?? null,
        },
      });
    } catch (error) {
      console.error("Failed to update location", error);
      res.status(500).json({ error: "Failed to update location" });
    }
  });
}


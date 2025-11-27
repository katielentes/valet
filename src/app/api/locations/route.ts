import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "../../../../src/generated/prisma/client";
import prisma from "../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

const pricingTierSchema = z.object({
  maxHours: z.number().int().min(1).nullable(),
  rateCents: z.number().int().min(0),
  inOutPrivileges: z.boolean().optional().default(false),
});

const createLocationSchema = z.object({
  name: z.string().min(1).max(120),
  identifier: z.string().min(1).max(50),
  taxRateBasisPoints: z.number().int().min(0).max(10000).default(0),
  hotelSharePoints: z.number().int().min(0).max(10000).default(0),
  overnightRateCents: z.number().int().min(0).default(0),
  overnightInOutPrivileges: z.boolean().default(true),
  pricingTiers: z.array(pricingTierSchema).optional().default([]),
});

export async function GET(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (session.user.role === "STAFF") {
      if (!session.user.locationId) {
        return NextResponse.json({ error: "User is not assigned to a location" }, { status: 403 });
      }

      const location = await prisma.location.findFirst({
        where: { tenantId: session.tenantId, id: session.user.locationId },
      });

      return NextResponse.json({
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
    }

    const locations = await prisma.location.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
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
    return NextResponse.json({ error: "Unable to load locations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only managers and admins can create locations
  if (session.user.role !== UserRole.MANAGER && session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Only managers and admins can create locations" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid location data", details: parsed.error.issues }, { status: 400 });
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
      return NextResponse.json({ error: "A location with this identifier already exists" }, { status: 409 });
    }

    const newLocation = await prisma.location.create({
      data: {
        tenantId: session.tenantId,
        name: locationData.name,
        identifier: locationData.identifier,
        taxRateBasisPoints: locationData.taxRateBasisPoints,
        hotelSharePoints: locationData.hotelSharePoints,
        overnightRateCents: locationData.overnightRateCents,
        overnightInOutPrivileges: locationData.overnightInOutPrivileges,
        pricingTiers: locationData.pricingTiers
          ? (locationData.pricingTiers as Prisma.InputJsonValue)
          : undefined,
      },
    });

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        ticketId: null,
        userId: session.userId ?? null,
        action: "LOCATION_UPDATED",
        details: {
          locationId: newLocation.id,
          locationName: newLocation.name,
          locationIdentifier: newLocation.identifier,
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
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
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 });
  }
}


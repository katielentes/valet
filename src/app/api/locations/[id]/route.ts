import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "../../../../../src/generated/prisma/client";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

const pricingTierSchema = z.object({
  maxHours: z.number().int().min(1).nullable(),
  rateCents: z.number().int().min(0),
  inOutPrivileges: z.boolean().optional().default(false),
});

const updateLocationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  taxRateBasisPoints: z.number().int().min(0).max(10000).optional(),
  hotelSharePoints: z.number().int().min(0).max(10000).optional(),
  overnightRateCents: z.number().int().min(0).optional(),
  overnightInOutPrivileges: z.boolean().optional(),
  pricingTiers: z.array(pricingTierSchema).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only managers and admins can update locations
  if (session.user.role !== UserRole.MANAGER && session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Only managers and admins can update location settings" }, { status: 403 });
  }

  const { id: locationId } = await params;
  const body = await req.json();
  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }

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
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
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
        ticketId: null,
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

    return NextResponse.json({
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
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}


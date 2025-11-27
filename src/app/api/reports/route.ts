import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "../../../../src/generated/prisma/client";
import prisma from "../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const session = await resolveSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isStaff = session.user.role === UserRole.STAFF;
    const userLocationId = session.user.locationId ?? session.user.location?.id ?? null;
    const effectiveLocationId = isStaff ? userLocationId : undefined;

    const reports = await prisma.report.findMany({
      where: {
        tenantId: session.tenantId,
        ...(effectiveLocationId ? { locationId: effectiveLocationId } : {}),
      },
      include: {
        location: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        periodType: r.periodType,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
        location: r.location
          ? {
              id: r.location.id,
              name: r.location.name,
              identifier: r.location.identifier,
            }
          : null,
        data: r.data,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to load reports", error);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}


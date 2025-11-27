import { NextRequest, NextResponse } from "next/server";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const session = await resolveSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        tenantId: session.user.tenantId,
        location: session.user.location
          ? {
              id: session.user.location.id,
              name: session.user.location.name,
              identifier: session.user.location.identifier,
            }
          : null,
      },
      tenant: {
        id: session.tenant.id,
        name: session.tenant.name,
        slug: session.tenant.slug,
      },
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Failed to resolve session", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


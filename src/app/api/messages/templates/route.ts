import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../server/lib/prisma";
import { resolveSessionFromRequest } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const session = await resolveSessionFromRequest(req);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenant context" }, { status: 400 });
    }

    const templates = await prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to load message templates", error);
    return NextResponse.json({ error: "Unable to load templates" }, { status: 500 });
  }
}


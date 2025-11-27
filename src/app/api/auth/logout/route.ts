import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "../../../../../server/lib/prisma";
import { hashToken, SESSION_COOKIE_NAME } from "../../../../../server/lib/session";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    
    if (sessionCookie?.value) {
      // Delete the session from the database
      const hashedToken = hashToken(sessionCookie.value);
      await prisma.session.deleteMany({ where: { tokenHash: hashedToken } });
    }

    const response = NextResponse.json({}, { status: 204 });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    console.error("Logout failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


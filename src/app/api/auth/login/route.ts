import { NextRequest, NextResponse } from "next/server";
import { compareSync } from "bcryptjs";
import { z } from "zod";
import { cookies } from "next/headers";

import prisma from "../../../../../server/lib/prisma";
import {
  generateSessionToken,
  persistSession,
  serializeSessionCookie,
} from "../../../../../server/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.error("Failed to parse request body:", error);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      console.error("Login validation error:", parsed.error.issues);
      return NextResponse.json({ 
        error: "Invalid email or password",
        details: parsed.error.issues 
      }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true, location: true },
    });

    if (!user || !compareSync(password, user.hashedPassword)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await prisma.session.deleteMany({ where: { userId: user.id } });

    const token = generateSessionToken();

    const userAgent = req.headers.get("user-agent") || "";
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";

    await persistSession({
      token,
      tenantId: user.tenantId,
      userId: user.id,
      userAgent,
      ipAddress,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        location: user.location
          ? {
              id: user.location.id,
              name: user.location.name,
              identifier: user.location.identifier,
            }
          : null,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
    });

    // Set the session cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    };
    
    response.cookies.set("valetpro_session", token, cookieOptions);

    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


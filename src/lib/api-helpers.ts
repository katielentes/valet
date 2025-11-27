import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import prisma from "../../server/lib/prisma";
import { hashToken, SESSION_COOKIE_NAME } from "../../server/lib/session";

/**
 * Resolve session from Next.js request (similar to Express resolveSession)
 */
export async function resolveSessionFromRequest(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  
  if (!sessionCookie?.value) {
    return null;
  }

  const token = sessionCookie.value;
  const tokenHash = hashToken(token);
  
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          location: true,
        },
      },
      tenant: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { tokenHash } });
    return null;
  }

  return session;
}


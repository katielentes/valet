import { createHash, randomBytes } from "node:crypto";
import { serialize, parse } from "cookie";
import type { Request, Response } from "express";

import prisma from "./prisma";

export const SESSION_COOKIE_NAME = "valetpro_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function serializeSessionCookie(token: string) {
  return serialize(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function serializeBlankSessionCookie() {
  return serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function persistSession(args: {
  token: string;
  tenantId: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  const tokenHash = hashToken(args.token);

  await prisma.session.create({
    data: {
      tenantId: args.tenantId,
      userId: args.userId,
      tokenHash,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

export function extractSessionToken(req: Request): string | null {
  if (!req.headers.cookie) return null;
  const cookies = parse(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export async function resolveSession(req: Request) {
  const token = extractSessionToken(req);
  if (!token) return null;

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

export async function clearSession(req: Request, res: Response) {
  const token = extractSessionToken(req);
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.session.deleteMany({ where: { tokenHash } });
  }

  res.setHeader("Set-Cookie", serializeBlankSessionCookie());
}


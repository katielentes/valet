import "dotenv/config";

import express from "express";
import next from "next";
import { compareSync } from "bcryptjs";
import { z } from "zod";

import prisma from "./lib/prisma";
import {
  clearSession,
  generateSessionToken,
  persistSession,
  resolveSession,
  serializeSessionCookie,
} from "./lib/session";
import { registerTicketRoutes } from "./routes/tickets";
import { registerMessageRoutes } from "./routes/messages";
import { registerLocationRoutes } from "./routes/locations";
import { registerPaymentRoutes } from "./routes/payments";
import { registerReportRoutes } from "./routes/reports";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

async function bootstrap() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = express();

  // Stripe webhook endpoint needs raw body for signature verification
  // Must be registered before JSON middleware
  server.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      // Import and call webhook handler
      const { handleStripeWebhook } = await import("./routes/webhooks");
      return handleStripeWebhook(req, res);
    }
  );

  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  server.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  registerTicketRoutes(server);
  registerMessageRoutes(server);
  registerLocationRoutes(server);
  registerPaymentRoutes(server);
  registerReportRoutes(server);

  server.get("/api/auth/session", async (req, res) => {
    try {
      const session = await resolveSession(req);

      if (!session) {
        res.status(401).json({ user: null });
        return;
      }

      res.json({
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  server.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email or password" });
      return;
    }

    const { email, password } = parsed.data;

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { tenant: true, location: true },
      });

      if (!user || !compareSync(password, user.hashedPassword)) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await prisma.session.deleteMany({ where: { userId: user.id } });

      const token = generateSessionToken();

      await persistSession({
        token,
        tenantId: user.tenantId,
        userId: user.id,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });

      res.setHeader("Set-Cookie", serializeSessionCookie(token));

      res.json({
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
    } catch (error) {
      console.error("Login failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  server.post("/api/auth/logout", async (req, res) => {
    try {
      await clearSession(req, res);
      res.status(204).end();
    } catch (error) {
      console.error("Logout failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  server.use((req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    console.log(`🚀 Server ready on http://${hostname}:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start the server", err);
  process.exit(1);
});


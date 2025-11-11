import { Router } from "express";

import prisma from "../lib/prisma";
import { resolveSession } from "../lib/session";

export function registerLocationRoutes(router: Router) {
  router.get("/api/locations", async (req, res) => {
    const session = await resolveSession(req);
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const locations = await prisma.location.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: "asc" },
      });

      res.json({
        locations: locations.map((location) => ({
          id: location.id,
          name: location.name,
          identifier: location.identifier,
          taxRateBasisPoints: location.taxRateBasisPoints,
          hotelSharePoints: location.hotelSharePoints,
          hourlyRateCents: location.hourlyRateCents,
          hourlyTierHours: location.hourlyTierHours,
          overnightRateCents: location.overnightRateCents,
        })),
      });
    } catch (error) {
      console.error("Failed to load locations", error);
      res.status(500).json({ error: "Unable to load locations" });
    }
  });
}


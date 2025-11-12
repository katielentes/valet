type TicketForPricing = {
  rateType: "HOURLY" | "OVERNIGHT";
  inOutPrivileges: boolean;
  checkInTime: Date;
  checkOutTime: Date | null;
  location: {
    identifier: string;
    hourlyRateCents: number;
    overnightRateCents: number;
    hourlyTierHours: number | null;
  };
};

export function calculateProjectedAmountCents(
  ticket: TicketForPricing,
  referenceDate: Date = new Date()
) {
  if (ticket.inOutPrivileges) {
    return ticket.location.overnightRateCents;
  }

  if (ticket.rateType === "OVERNIGHT") {
    return ticket.location.overnightRateCents;
  }

  const endTime = ticket.checkOutTime ?? referenceDate;
  const diffMs = Math.max(endTime.getTime() - ticket.checkInTime.getTime(), 0);
  const diffHours = diffMs / (1000 * 60 * 60);
  const locationId = ticket.location.identifier.toLowerCase();

  // Location-specific pricing logic
  if (locationId === "hampton") {
    // Flat $20 (2000 cents) for up to 3 hours, then overnight ($46 / 4600 cents)
    if (diffHours <= 3) {
      return 2000;
    }
    return ticket.location.overnightRateCents;
  }

  if (locationId === "hyatt") {
    // Tiered pricing:
    // - Up to 2 hours: $22 (2200 cents)
    // - Up to 5 hours: $33 (3300 cents)
    // - Beyond 5 hours: overnight ($55 / 5500 cents)
    if (diffHours <= 2) {
      return 2200;
    }
    if (diffHours <= 5) {
      return 3300;
    }
    return ticket.location.overnightRateCents;
  }

  // Default fallback for any future locations: hourly rate with optional tier-to-overnight escalation
  const billedHours = Math.max(1, Math.ceil(diffHours));
  const tier = ticket.location.hourlyTierHours ?? 0;

  if (tier && diffHours > tier) {
    return ticket.location.overnightRateCents;
  }

  return ticket.location.hourlyRateCents * billedHours;
}


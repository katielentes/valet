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
  const endTime = ticket.checkOutTime ?? referenceDate;
  const diffMs = Math.max(endTime.getTime() - ticket.checkInTime.getTime(), 0);
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  // Helper function to calculate overnight rate per day
  const calculateOvernightRate = (days: number): number => {
    const fullDays = Math.ceil(days); // Round up to full days
    return ticket.location.overnightRateCents * fullDays;
  };

  // In/out privileges: charge overnight rate per day
  if (ticket.inOutPrivileges) {
    return calculateOvernightRate(diffDays);
  }

  // Overnight tickets: charge overnight rate per day
  if (ticket.rateType === "OVERNIGHT") {
    return calculateOvernightRate(diffDays);
  }

  // Hourly tickets: check location-specific tiers first
  const locationId = ticket.location.identifier.toLowerCase();

  if (locationId === "hampton") {
    // Flat $20 (2000 cents) for up to 3 hours
    if (diffHours <= 3) {
      return 2000;
    }
    // Beyond 3 hours: charge overnight rate per day
    return calculateOvernightRate(diffDays);
  }

  if (locationId === "hyatt") {
    // Tiered pricing:
    // - Up to 2 hours: $22 (2200 cents)
    // - Up to 5 hours: $33 (3300 cents)
    // - Beyond 5 hours: overnight rate per day
    if (diffHours <= 2) {
      return 2200;
    }
    if (diffHours <= 5) {
      return 3300;
    }
    return calculateOvernightRate(diffDays);
  }

  // Default fallback for any future locations: hourly rate with optional tier-to-overnight escalation
  const tier = ticket.location.hourlyTierHours ?? 0;

  if (tier && diffHours > tier) {
    // Exceeded tier: charge overnight rate per day
    return calculateOvernightRate(diffDays);
  }

  // Within tier: charge hourly rate
  const billedHours = Math.max(1, Math.ceil(diffHours));
  return ticket.location.hourlyRateCents * billedHours;
}


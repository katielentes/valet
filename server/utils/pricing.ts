type PricingTier = {
  maxHours: number | null;
  rateCents: number;
  inOutPrivileges?: boolean;
};

type TicketForPricing = {
  rateType: "HOURLY" | "OVERNIGHT";
  inOutPrivileges: boolean;
  checkInTime: Date;
  checkOutTime: Date | null;
  durationDays?: number | null;
  durationHours?: number | null;
  location: {
    identifier: string;
    overnightRateCents: number;
    pricingTiers?: PricingTier[] | null;
  };
};

export function calculateProjectedAmountCents(
  ticket: TicketForPricing,
  referenceDate: Date = new Date()
) {
  // If duration is set, use it for pricing instead of elapsed time
  // This allows customers to prepay for their entire stay
  let diffHours: number;
  let diffDays: number;
  
  if (ticket.rateType === "OVERNIGHT" && ticket.durationDays != null && ticket.durationDays > 0) {
    // Use prepaid duration for overnight tickets
    diffDays = ticket.durationDays;
    diffHours = diffDays * 24;
  } else if (ticket.rateType === "HOURLY" && ticket.durationHours != null && ticket.durationHours > 0) {
    // Use prepaid duration for hourly tickets
    diffHours = ticket.durationHours;
    diffDays = diffHours / 24;
  } else {
    // Fall back to elapsed time calculation
    const endTime = ticket.checkOutTime ?? referenceDate;
    const diffMs = Math.max(endTime.getTime() - ticket.checkInTime.getTime(), 0);
    diffHours = diffMs / (1000 * 60 * 60);
    diffDays = diffHours / 24;
  }

  // Helper function to calculate overnight rate per day
  const calculateOvernightRate = (days: number): number => {
    const fullDays = Math.ceil(days); // Round up to full days
    return ticket.location.overnightRateCents * fullDays;
  };

  // Overnight tickets: charge overnight rate per day
  if (ticket.rateType === "OVERNIGHT") {
    return calculateOvernightRate(diffDays);
  }

  // Note: In/out privileges are now a property of the rate/tier, not the ticket
  // Staff should manually set tickets to "OVERNIGHT" rate type if they want in/out privileges

  // Hourly tickets: check for pricing tiers first
  if (ticket.location.pricingTiers && ticket.location.pricingTiers.length > 0) {
    // Use configured pricing tiers
    // Sort tiers by maxHours (null goes last)
    const sortedTiers = [...ticket.location.pricingTiers].sort((a, b) => {
      if (a.maxHours === null) return 1;
      if (b.maxHours === null) return -1;
      return a.maxHours - b.maxHours;
    });
    
    // Find the appropriate tier based on hours
    for (const tier of sortedTiers) {
      if (tier.maxHours === null) {
        // This is the final tier (unlimited hours) - use its rate
        // But if it's been more than 24 hours, use overnight rate per day
        return diffDays >= 1 ? calculateOvernightRate(diffDays) : tier.rateCents;
      }
      if (diffHours <= tier.maxHours) {
        // If we've exceeded 24 hours, use overnight rate per day instead of tier rate
        return diffDays >= 1 ? calculateOvernightRate(diffDays) : tier.rateCents;
      }
    }
    
    // If we've exceeded all tiers, use overnight rate per day
    return calculateOvernightRate(diffDays);
  }

  // Fallback to hardcoded location-specific logic for backward compatibility
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

  // Default fallback: if no tiers configured and no hardcoded logic matches, use overnight rate
  return calculateOvernightRate(diffDays);
}


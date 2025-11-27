// Shared helper functions for message processing

export const REQUEST_KEYWORDS = ["ready", "pickup", "pick up", "car", "retrieve", "bring"];
export const YES_KEYWORDS = ["yes", "y", "yeah", "yep"];
export const NO_KEYWORDS = ["no", "n", "nope", "not", "never"];
export const RETURN_YES_KEYWORDS = ["yes", "y", "yeah", "yep", "return", "returning", "back", "coming back", "will return"];
export const RETURN_NO_KEYWORDS = ["no", "n", "nope", "not", "never", "not returning", "won't return", "not coming back"];

// Helper function to determine if a ticket has in/out privileges based on location settings
export function hasInOutPrivileges(ticket: {
  rateType: "HOURLY" | "OVERNIGHT";
  inOutPrivileges: boolean;
  location: {
    overnightInOutPrivileges: boolean;
    pricingTiers?: unknown;
  };
}): boolean {
  // Cast pricingTiers to the expected type
  const pricingTiers = ticket.location.pricingTiers as Array<{ maxHours: number | null; rateCents: number; inOutPrivileges?: boolean }> | null | undefined;
  
  if (ticket.rateType === "OVERNIGHT") {
    // For overnight, check the location's overnightInOutPrivileges setting
    if (ticket.location.overnightInOutPrivileges) {
      return true;
    }
    // Fallback to checking final tier if overnightInOutPrivileges is not set
    if (pricingTiers && pricingTiers.length > 0) {
      const finalTier = pricingTiers.find((tier) => tier.maxHours === null);
      return finalTier?.inOutPrivileges === true;
    }
    return false;
  } else {
    // For hourly, check if any hourly tier (maxHours !== null) has inOutPrivileges
    if (!pricingTiers || pricingTiers.length === 0) {
      return false; // No tiers configured, no in/out privileges
    }
    return pricingTiers.some(
      (tier) => tier.maxHours !== null && tier.inOutPrivileges === true
    );
  }
}

export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  // If it starts with 1 and has 11 digits, return as is
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  // If it has 10 digits, assume US number and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // If it already starts with +, return as is
  if (phone.startsWith("+")) {
    return phone;
  }
  // Otherwise, try to format it
  return `+${digits}`;
}

export function generatePhoneVariations(phone: string | null | undefined): string[] {
  if (!phone) return [];
  const normalized = normalizePhoneNumber(phone);
  const digits = normalized.replace(/\D/g, "");
  
  const variations = new Set<string>();
  
  // Add normalized version
  variations.add(normalized);
  
  // Add without + prefix
  if (normalized.startsWith("+")) {
    variations.add(normalized.slice(1));
  }
  
  // Add with + prefix if missing
  if (!normalized.startsWith("+")) {
    variations.add(`+${normalized}`);
  }
  
  // Add just the last 10 digits (US number without country code)
  if (digits.length >= 10) {
    variations.add(digits.slice(-10));
  }
  
  // Add with 1 prefix
  if (digits.length === 10) {
    variations.add(`1${digits}`);
    variations.add(`+1${digits}`);
  }
  
  return Array.from(variations);
}


# Location Pricing Configuration Requirements

## Overview
Each tenant should be able to configure custom pricing models for each location. This allows flexibility for different business models and pricing strategies.

## Pricing Models

### 1. Flat Rate Chunks
Define fixed rates for specific time periods. Example configurations:
- **Hampton Inn**: $20 for up to 3 hours, then $46 overnight
- **Hyatt Regency**: $22 for up to 2 hours, $33 for up to 5 hours, then $55 overnight

**Configuration Structure:**
```typescript
{
  model: "FLAT_RATE_CHUNKS",
  chunks: [
    { maxHours: 3, rateCents: 2000 },  // $20 for up to 3 hours
    { maxHours: null, rateCents: 4600 } // $46 overnight (null = no limit)
  ],
  overnightRateCents: 4600
}
```

### 2. Hourly Rate
Per-hour billing with optional escalation to overnight rate after a threshold.

**Configuration Structure:**
```typescript
{
  model: "HOURLY",
  hourlyRateCents: 1000,        // $10 per hour
  hourlyTierHours: 8,           // After 8 hours, charge overnight rate
  overnightRateCents: 5000      // $50 overnight
}
```

## Access Control
- **MANAGER** and **ADMIN** roles: Can view and edit location pricing settings
- **STAFF** role: Read-only access to location information

## Implementation Notes

### Schema Considerations
Current Location model has:
- `hourlyRateCents` (Int)
- `hourlyTierHours` (Int?)
- `overnightRateCents` (Int)

**Potential Schema Updates:**
1. Add `pricingModel` enum field: `FLAT_RATE_CHUNKS` | `HOURLY`
2. Add `pricingConfig` JSON field to store:
   - For FLAT_RATE_CHUNKS: array of chunks with maxHours and rateCents
   - For HOURLY: hourlyRateCents, hourlyTierHours, overnightRateCents
3. Keep existing fields for backward compatibility during migration

### Pricing Calculation Logic
The `calculateProjectedAmountCents` function in `server/utils/pricing.ts` currently has hardcoded logic for Hampton and Hyatt. This needs to be refactored to:
1. Read the location's `pricingModel` and `pricingConfig`
2. Apply the appropriate calculation based on the model type
3. Support both flat rate chunks and hourly calculations dynamically

### UI Requirements
The Locations page should provide:
1. **Pricing Model Selector**: Dropdown to choose between "Flat Rate Chunks" and "Hourly"
2. **Flat Rate Chunks Editor**:
   - Add/remove chunk rows
   - Each row: max hours (or "unlimited" for overnight) and rate in dollars
   - Validation: chunks must be in ascending order by hours
3. **Hourly Rate Editor**:
   - Hourly rate input
   - Optional tier hours threshold
   - Overnight rate input
4. **Tax & Hotel Share**: Existing fields for tax rate and hotel share percentage
5. **Role-Based UI**: Edit controls only visible to MANAGER and ADMIN users

## Migration Strategy
1. Add new schema fields with defaults that match current Hampton/Hyatt behavior
2. Update pricing calculation to check for new config first, fall back to hardcoded logic
3. Migrate existing locations to new pricing model format
4. Remove hardcoded logic once all locations are migrated

## Testing Considerations
- Test flat rate chunks with various configurations
- Test hourly pricing with and without tier escalation
- Test role-based access control
- Test pricing calculations match expected business rules
- Test edge cases (exactly at tier boundaries, in/out privileges, etc.)


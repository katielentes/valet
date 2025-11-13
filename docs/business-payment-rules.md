# ValetPro Business & Payment Rules

This document summarizes the operating policies enforced (or expected to be enforced) throughout the ValetPro platform. It should be kept in sync with product decisions, UI copy, and backend validations.

## Business Operations

### Ticket Lifecycle
- New tickets require a unique ticket number per tenant and must be created for a specific location.
- Staff users are restricted to the location assigned to their user record for ticket creation and updates.
- Status options: `CHECKED_IN`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED`.
- Vehicle status options: `WITH_US`, `AWAY`. Staff can toggle this, subject to payment rules below.
- Audit logs capture key actions (creation, updates, messaging, payments) with timestamps and actor context.

### In/Out Privileges
- Tickets with in/out privileges automatically bill at the overnight rate (via pricing utilities).
- When an in/out guest texts in, the system asks whether they plan to return so staff can maintain accurate vehicle status.
- Vehicles with in/out privileges cannot be marked `AWAY` (and customers are warned via SMS) if an outstanding balance exists.

### Messaging Flows
- **Welcome Message**: Upon ticket creation (when Twilio is configured and a phone number is present), customers receive:
  - Confirmation of their location.
  - Instructions to text the valet number with their ticket number when ready for pickup.
  - A reminder (for in/out guests) to tell the valet if they expect to return.
- **Pickup Requests**: Inbound SMS messages are parsed for pickup keywords. The platform:
  - Sends an acknowledgment message when no balance is due.
  - Auto-sends a Stripe payment link if an hourly guest has exceeded prepaid time and still owes money.
- **Return Intent Tracking**: Replies containing variations of “yes” or “no” are logged to indicate whether in/out guests plan to return.
- Staff-triggered outbound messages remain available through the web UI, with role-based location restrictions.

## Payment Policies

### General Requirements
- Stripe payment links are generated through the platform and sent via SMS (Twilio). They include metadata tying the payment to the tenant and ticket.
- A completed payment is required before staff can move a ticket to `READY_FOR_PICKUP` or `COMPLETED`.
- Payment history per ticket is tracked; outstanding balances are calculated as `projected amount - total completed payments`.
- Payment status meanings:
  - `PENDING`: payment link issued or in-person payment recorded but funds not yet settled. Ticket still shows an outstanding balance.
  - `PAYMENT_LINK_SENT`: the guest has been sent a Stripe link; no funds applied yet.
  - `COMPLETED`: funds captured; contributes toward the ticket’s paid total.
  - `FAILED` / `REFUNDED`: payment attempt failed or was reversed; staff must follow up manually.
- Staff can mock or record partial payments by creating a `PENDING` payment with the amount received. The ticket remains blocked until the total of `COMPLETED` payments covers the projected balance.

### Hourly vs. Overnight Billing
- Each location defines fixed tiers instead of per-hour billing:
  - **Hampton Inn:** Single tier at $20 covering up to 3 hours; anything beyond 3 hours (or in/out privileges) charges the overnight rate per day ($46/day).
  - **Hyatt Regency:** Two tiers – up to 2 hours for $22, up to 5 hours for $33; parking beyond 5 hours (or in/out privileges) charges the overnight rate per day ($55/day).
- **Multi-Day Billing**: For tickets active more than 24 hours, the overnight rate is charged per day:
  - More than 24 hours: overnight rate × 2
  - More than 48 hours: overnight rate × 3
  - And so on (rounded up to full days)
- This applies to:
  - Tickets with in/out privileges (always charged per day)
  - Overnight tickets (charged per day)
  - Hourly tickets that exceed their tier threshold (charged per day after exceeding tier)
- Prepaid tiers must be satisfied before a car can be marked `READY_FOR_PICKUP` or `COMPLETED`. If a stay crosses into the overnight tier, the outstanding difference is collected automatically.
- The pricing utility enforces these thresholds when computing projected balances, ensuring SMS/payment flows always reference the correct amount.

### Vehicle Release Rules
- Customers must settle all balances before the vehicle is marked `READY_FOR_PICKUP` or `COMPLETED`.
- For in/out privileges:
  - Cars cannot be toggled to `AWAY` (i.e., leave the premises) if there is still an outstanding balance.
  - When customers attempt to leave mid-stay, staff must ensure payment is collected via the payment link flow before release.

### Operational Notes
- Payment link generation is reusable and may be triggered manually (staff button) or automatically (SMS workflow).
- Audit logs capture every sent payment link with contextual metadata (reason, automated/manual origin).
- Message history records outbound payment link notifications, providing visibility into customer communication.

## Maintenance Checklist
- Keep this document updated when introducing new ticket states, payment conditions, or messaging automations.
- Validate that environment variables for Stripe and Twilio are set in each deployment to ensure automated flows function.
- Coordinate UI/UX copy changes with these rules to maintain consistent guest and staff expectations.


# Future Multi-Tenant State Planning

This document captures requirements and design considerations for running ValetPro as a true multi-tenant platform, with a focus on payment processing (Stripe) and related operational concerns.

## Stripe Credential Strategy

### Goals
- Allow each tenant (hotel/operator) to accept payments into their own Stripe account.
- Keep platform-level control over payment workflows (link generation, receipt logging, refunds).
- Maintain strict separation of secrets and ensure rotatability per tenant.

### Options
| Approach | Pros | Cons | Notes |
|----------|------|------|-------|
| **Store raw Stripe secret per tenant** | Simple to implement; tenant keeps full control | You must securely store & rotate keys; compliance burden on you | Useful for small installs or transitional phase |
| **Stripe Connect (Standard/Express)** | Stripe handles onboarding, payouts, compliance; you keep one platform key | Requires platform account & understanding of Connect flows | Recommended for SaaS scaling |
| **Stripe Connect (Custom)** | Full control over UX and fund flows | High compliance overhead | Only if you need white-label payouts |

### Recommended Path
- Adopt **Stripe Connect Standard** where tenants connect their existing Stripe account through Stripe’s OAuth/link flow.
- Store the resulting `stripeAccountId` (and optional refresh tokens if needed) on the tenant record.
- For every outbound Stripe API call (payment links, refunds, etc.), use the `Stripe-Account` header or per-request option to target the tenant’s account.
- Keep a fallback for “platform-managed” tenants (using your master Stripe account) to support demo tenants or early adopters.

## Data Model Updates

- Extend `Tenant` model with fields such as:
  - `stripeAccountId` (string, nullable)
  - `stripeOnboardingStatus` (enum: `NOT_CONNECTED`, `PENDING`, `CONNECTED`, `REVOKED`)
  - `stripeAccountType` (enum: `PLATFORM`, `CONNECT_STANDARD`, `RAW_KEYS`, etc.)
  - Optional encrypted blobs for raw API keys if supporting the non-Connect path.
- Extend `Payment` metadata to capture:
  - `stripeAccountId` used for the transaction.
  - `stripePaymentIntentId` (if moving beyond payment links).
  - Flags for “collected via platform account” vs “tenant account”.

## Secret Management

- Use a secrets vault (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) to store per-tenant secrets.
- Provide a rotation workflow:
  - Tenants can re-authenticate their Stripe account.
  - Old keys are revoked/archived.
  - Update the encrypted secret reference without redeploying.
- Never store raw secrets unencrypted in the main database. Store references or ciphertext only.

## Backend Request Flow

1. **Identify Tenant Context**
   - Every authenticated request includes `tenantId` (from session).
   - Backend resolves `Tenant` record, including Stripe configuration.

2. **Select Stripe Client/Options**
   - If using Connect: reuse a singleton Stripe client with platform key and pass `{ stripeAccount: tenant.stripeAccountId }` in each request.
   - If using per-tenant raw keys: instantiate a Stripe client dynamically with the tenant’s secret (cache per request or short-lived).

3. **Execute Payment Operation**
   - `paymentLinks.create`, `paymentIntents.create`, etc., with tenant-specific header.
   - Store results (`stripeLinkId`, `stripePaymentIntentId`, etc.) along with `tenantId` and `stripeAccountId`.

4. **Handle errors & fallbacks**
   - If tenant Stripe account not configured, respond with actionable error (e.g., “connect Stripe account first”).
   - Plan for sandbox/testing paths (e.g., default to platform account in development).

## Webhook Routing

- Configure a single webhook endpoint (e.g., `/api/webhooks/stripe`).
- Stripe Connect events include the `Stripe-Account` header.
- In the handler:
  - Verify signature using the platform’s webhook secret (or per-tenant secret if using raw webhook endpoints).
  - Lookup tenant by `stripeAccountId`.
  - Process event (e.g., update payment status to `COMPLETED`) within that tenant context.
- Log unknown accounts or missing tenants for auditing.

## Tenant Onboarding Flow

1. Tenant admin visits “Payments” settings.
2. Click “Connect with Stripe” (Connect OAuth).
3. Complete Stripe onboarding; redirect back with `code`.
4. Backend exchanges `code` for `stripeAccountId` (and tokens as needed).
5. Update tenant record (status → `CONNECTED`).
6. Provide UI feedback (“Connected to Stripe: account xyz”).

### For raw keys (if supported):
- Provide a secure form to paste secret + optional webhook secret.
- Validate by making a test Stripe API call.
- Encrypt and store the secret reference.
- Warn tenant about security responsibilities.

## Testing & Sandbox Strategy

- Allow tenants to operate in **test mode** (Stripe test keys) before going live.
- Tag payments with a `mode` field (`test` vs `live`) to keep data separate.
- Provide a QA environment using Stripe test mode and Twilio test credentials.

## Operational Checklist

- [ ] Update `Tenant` schema & migrations.
- [ ] Implement Stripe Connect onboarding flow (OAuth).
- [ ] Store and retrieve per-tenant Stripe account IDs securely.
- [ ] Update payment creation logic to supply tenant-specific Stripe context.
- [ ] Adjust Prisma seeds/tests to accommodate multi-tenant Stripe config.
- [ ] Build UI health checks (e.g., “last webhook received”, “account connected” badges).
- [ ] Document key rotation and account disconnect procedures.

## Future Enhancements

- Support per-tenant taxes/fees based on Stripe capabilities (e.g., automatic tax).
- Allow tenants to bring their own Stripe customer portal links.
- Integrate payout monitoring (dashboard showing latest Stripe payouts per tenant).
- Build analytics per tenant (revenue by account, refunds, average ticket value).



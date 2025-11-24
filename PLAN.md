# ValetPro App Development Plan

## Project Overview
- Build a mobile-first valet management platform using Next.js (App Router) with an Express backend.
- Track valet tickets, messaging, payments, reporting, and configurable financial parameters for multiple locations.
- Integrate Tailwind CSS and shadcn/ui for rapid UI development with a consistent design system.

## Architecture Snapshot
- `next` frontend in `src/` for UI and client interactions.
- `express` server (planned) to run alongside Next.js for REST hooks (Stripe, SMS) and backend logic.
- SQLite via Prisma (planned) as default database with migration path to PostgreSQL.
- Shared `zod` schemas for validation between frontend and backend.
- Infrastructure ready for Twilio SMS + Stripe Payment Links integrations.
- Data requirements anchored in `context.md` (multi-location pricing, mobile-first workflows, reporting needs).
- TanStack Query for client-side caching and performant data fetching across modules.

## Active Workstreams
1. **Core UI Foundation**
   - Configure Tailwind theme tokens, responsive breakpoints, and utility classes (keep defaults lightweight while documenting override points for future tweaks).
   - Install shadcn/ui, scaffold base components (buttons, cards, dialog, tabs) using the standard theme with optional customization hooks.
2. **Backend Integration**
   - Add Express server entry point with Next.js middleware handoff.
   - Define routes for ticket CRUD, reports, messages, and payment processing.
3. **Data Modeling**
   - Introduce Prisma schema covering locations, tickets, messages, reports, pricing tables (per `context.md` requirements).
   - Seed initial Hampton/Hyatt data with tax and revenue share percentages (Hampton: $20/3hr + $46 overnight, 5% share; Hyatt: $22/2hr + $33/5hr + $55 overnight, 6% share; 23.25% Chicago tax).
4. **Auth & Multi-Tenancy**
   - Implement user accounts with role-based access (valet, manager, admin).
   - Support tenant isolation for future multi-client deployments.
   - Add audit log entries for ticket actions (timestamps, user IDs, action details).
5. **Feature Modules**
   - Tickets: creation, editing, details, live pricing visualization.
   - Messaging: Twilio webhook handlers, notification templates (customer text requests noted in `context.md`).
   - Payments: Stripe link generation, projected revenue tracking aligned with described products and pricing.
   - Reports: Weekly/monthly analytics, vehicle status, financial summaries (with taxes/hotel share metrics as described).
5. **UX Enhancements**
   - Mobile-first layouts, responsive card controls, accessible modals.
   - Visual cues for rate types, location filters, and alert banners.
6. **Navigation Shell**
   - Design responsive sidebar + topbar with quick access to tickets, payments, reports, messaging.
   - Provide mobile drawer behavior, tablet collapsible sidebar, desktop persistent navigation.
   - Surface active location filter, search, notifications stub, and user profile/logout entry.

- [x] Configure Tailwind globals (`globals.css`, `tailwind.config.ts`) for design tokens while preserving an easy path for later theme adjustments.
- [x] Install shadcn/ui CLI and generate initial component set.
- [x] Set up Express server scaffold with Next.js custom server entry.
- [x] Add Prisma + initialize schema for locations and tickets.
- [x] Model audit logging + multi-tenant auth flow.
- [x] Build initial migration + seed script (tenants, users, Hampton/Hyatt baseline data).
- [x] Implement auth endpoints + session handling (Next/Express bridge).
- [x] Build login UI (shadcn form + TanStack mutations) and guard app routes.
- [x] Wire TanStack Query hooks for auth session management on the client.
- [x] Build protected navigation shell (sidebar, topbar, responsive actions).
- [x] Implement Active Tickets dashboard with live data bindings.
- [x] Deliver outbound messaging (Twilio send flow, templates, ticket logging).
- [x] Implement ticket creation & editing (forms, API, audit logging).
- [x] Implement payment workflows in UI (Stripe link integration & projected billing).
- [x] Add payments index page with metrics table view.

## Progress Log
- **2025-11-11** — Initialized shadcn (`components.json`, neutral palette) and added base UI components (`button`, `card`, `dialog`, `tabs`, `badge`, form inputs). Tailwind globals now expose CSS variables for future theming tweaks; utility helper `cn` added to `src/lib/utils.ts`.
- **2025-11-11** — Installed TanStack Query + devtools and wired `QueryProvider` in `layout.tsx` for app-wide caching with tuned defaults (disabled refetch on focus, 30s stale time, 5m GC).
- **2025-11-11** — Added Express custom server (`server/index.ts`) with JSON parsing, health endpoint, and unified Next.js request handling; updated npm scripts to run via `tsx` in dev/prod.
- **2025-11-11** — Introduced Prisma schema covering tenants, users, locations, tickets, messaging, payments, reports, audit logs, and comments; generated client output under `src/generated/prisma`.
- **2025-11-11** — Created initial migration + seed script populating demo tenant/users, Hampton & Hyatt locations, sample tickets/messages/payments/report/audit data.
- **2025-11-11** — Added Prisma `Session` model, auth helpers, and Express endpoints for login/logout/session with secure cookies + hashed tokens.
- **2025-11-11** — Delivered login/logout UX with shadcn form components, TanStack Query mutations, protected layouts, and middleware-based route guarding.
- **2025-11-11** — Built responsive navigation shell (sidebar, topbar, mobile drawer) with location selector, search stub, notifications, and user summary leveraging shadcn components.
- **2025-11-11** — Implemented Active Tickets dashboard with Express-backed API, TanStack Query hooks, metrics summary, and responsive ticket cards using shadcn UI.
- **2025-11-11** — Added Twilio-backed messaging service with Express endpoints, template picker, ticket history, and “Notify Customer” workflow in Active Tickets.
- **2025-11-11** — Enabled ticket editing with audit logging, dynamic location filters tied to tenant data, and Prisma-backed update APIs.
- **2025-11-11** — Delivered ticket creation modal with live location defaults, Prisma create endpoint, and audit logging for new tickets.
- **2025-11-11** — Added Stripe payment link workflow with Twilio SMS delivery, payment records, and UI to send links per ticket.
- **2025-11-12** — Automated welcome SMS on ticket creation, enforced in/out payment requirements, and added Twilio inbound handler to trigger outstanding balance payment links and capture return intents.
- **2025-11-12** — Updated ticket card visuals (vehicle border indicates WITH_US/AWAY, badges for in/out privileges), adjusted Hampton/Hyatt tiered pricing logic, seeded additional Hampton scenarios, added Sonner-based toast system, and modernized edit dialog layout (sticky header/footer, scrollable body). Payments page now renders a table layout on desktop with responsive cards on mobile.
- **2025-11-13** — Implemented refund functionality for admins and managers: added refund fields to Payment schema, created refund API endpoint with Stripe integration, updated payments page UI with refund dialog and refunded amounts display, updated reports to show refunded amounts separately, and added SMS confirmation for refunds. **NOTE: Payments and refunds need thorough testing once Twilio and Stripe are fully configured.**
- **2025-11-24** — Messaging system fully operational: Twilio webhook configured and working, inbound messages are being received and saved correctly, Messages page displays all messages. **CRITICAL TODO: Stripe Payment Status Updates** — Payments created via Stripe payment links remain in "PENDING" status and never update to "COMPLETED". Need to implement Stripe webhook handler to listen for `checkout.session.completed` and `payment_intent.succeeded` events to automatically update payment status. This is blocking both testing (sandbox) and production. See "Payment Status Webhook" in Next Steps below.

## Tracking
- Update this plan as milestones are completed or scope changes.
- Reference key decisions, integration details, and testing notes here throughout development.
- Before starting new development sessions, review this plan and related docs (`docs/business-payment-rules.md`, `docs/future-multi-tenant-state.md`, `context.md`) to ensure alignment on priorities and open items.

## Next Steps
1. **Payment Status Webhook** (CRITICAL - Blocking Testing & Production)
   - **Problem**: Payments created via Stripe payment links stay in "PENDING" status and never update to "COMPLETED", even after successful payment in Stripe sandbox/test mode.
   - **Solution**: Implement Stripe webhook endpoint (`/api/webhooks/stripe`) to handle:
     - `checkout.session.completed` event - Update payment status to "COMPLETED" when checkout session completes
     - `payment_intent.succeeded` event - Alternative event that indicates successful payment
     - Verify webhook signature using `STRIPE_WEBHOOK_SECRET` environment variable
     - Lookup payment by `stripeLinkId` or metadata `ticketId` from webhook event
     - Update payment record: set `status = "COMPLETED"`, set `completedAt = now()`
     - Update ticket's `amountPaidCents` if needed
     - Log webhook events for debugging
   - **Testing**: Use Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) for local testing, configure webhook URL in Stripe Dashboard for production
   - **Files to modify**: 
     - Create `server/routes/webhooks.ts` or add to `server/routes/payments.ts`
     - Register webhook route in `server/index.ts`
     - Add `STRIPE_WEBHOOK_SECRET` to `env.example`
   - **Reference**: Stripe webhook docs, `docs/future-multi-tenant-state.md` has webhook routing notes
2. **Locations Page & Pricing Configuration** (PRIORITY - Deferred)
   - Build Locations management page for viewing and editing location settings.
   - **Pricing Model Configuration**: Allow each tenant to configure custom pricing per location:
     - Support two pricing models:
       - **Flat Rate Chunks**: Define fixed rates for time periods (e.g., $20 for up to 3 hours, then $46 overnight)
       - **Hourly Rate**: Per-hour billing with optional tier escalation to overnight rate
     - Store pricing configuration in Location model (may need schema update for pricing tiers/chunks as JSON)
     - Update pricing calculation logic (`server/utils/pricing.ts`) to be dynamic based on location configuration instead of hardcoded Hampton/Hyatt logic
     - **Role-Based Access**: Only MANAGER and ADMIN roles can edit location pricing settings (STAFF is read-only)
   - Allow editing of tax rates and hotel share percentages per location
   - UI should provide intuitive forms for configuring pricing tiers/chunks with validation
2. **Stripe Multi-Tenant Support**
   - Implement tenant-level Stripe credential storage (per `docs/future-multi-tenant-state.md`).
   - Add Connect onboarding flow and update payment link creation to target tenant accounts.
   - Build admin UI for verifying Stripe status, disconnecting/reconnecting tenants, and audit logging configuration changes.
3. **Reporting Enhancements**
   - Surface payment summaries by location (completed vs pending) with export options.
   - Add weekly/monthly dashboards leveraging Prisma aggregates and TanStack Query caching strategies already in place.
4. **Messaging & Notifications**
   - Expand toast usage to other critical flows (new ticket, payment failure) and document UI feedback patterns.
   - Introduce escalations for overdue payments (e.g., scheduled reminders, manager alerts).
5. **Performance & Testing**
   - Cover pricing tiers with unit tests to ensure Hampton/Hyatt scenarios remain accurate as new locations are added.
   - Integrate end-to-end tests for edit dialog accessibility (keyboard navigation, scroll behaviour across breakpoints).

## Requirements Trace (from `context.md`)
- Valet ticket lifecycle management with creation, editing, in/out privileges, vehicle status (with us/away), parking spot tracking.
- Customer communications: inbound SMS to request vehicles, outbound SMS notifications and templates, clear location selection messaging, and automated welcome/inbound prompts for in/out privileges.
- Payment safeguards: auto-detect overtime balances for prepaid hourly stays, auto-send Stripe link before pickup, and prevent in/out departures with outstanding balances.
- Payment processing: Stripe payment link flows with Hampton/Hyatt pricing tiers, projected revenue for open tickets, live pricing previews.
- Multi-location support: Hampton and Hyatt with configurable hourly/overnight rates, location filters, auto-select behavior when creating tickets.
- Mobile-first UI: responsive ticket cards, stacked action buttons, accessible modals, consistent spacing on small screens.
- Reporting: weekly/monthly analytics, vehicle status breakdowns, financial summaries including taxes, hotel share, projected revenue.
- Financial configuration: Chicago tax (23.25%) and hotel revenue share (Hampton 5%, Hyatt 6%) editable per location.
- **Custom Pricing Models**: Each tenant can configure their own pricing model per location (flat rate chunks or hourly) - only managers and admins can edit. This will be implemented on the Locations page.
- Multi-tenant readiness: user authentication, role-based access, tenant isolation planning, ticket audit logs with timestamps and user identity.
- UX details: rate type icons (hourly ⏱️, overnight 🌙), alert banners for location selection, scrollable modals, responsive badge layout.

# Stripe Webhook Setup Guide

## Overview
The Stripe webhook handler automatically updates payment status from `PENDING` to `COMPLETED` when customers complete payment via Stripe payment links.

## Local Testing Setup

### 1. Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Or download from https://stripe.com/docs/stripe-cli
```

### 2. Login to Stripe CLI
```bash
stripe login
```

### 3. Forward Webhooks to Local Server
```bash
# Make sure your local server is running on port 3000
# Then run:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This will:
- Show you a webhook signing secret (starts with `whsec_...`)
- Forward all Stripe events to your local server
- Display events in real-time

### 4. Set Webhook Secret (Optional for Local Testing)
For local testing with Stripe CLI, you can skip setting `STRIPE_WEBHOOK_SECRET` - the webhook handler will work without signature verification in development mode.

For production, you MUST set `STRIPE_WEBHOOK_SECRET` in your environment variables.

### 5. Test Payment Flow
1. Create a ticket in your app
2. Send a payment link to a test customer
3. Complete the payment in Stripe test mode
4. Watch your server logs - you should see:
   - `🔔 [STRIPE WEBHOOK] Received webhook event`
   - `💳 [STRIPE WEBHOOK] Processing checkout.session.completed`
   - `✅ [STRIPE WEBHOOK] Payment updated to COMPLETED`
   - `✅ [STRIPE WEBHOOK] Payment confirmation SMS sent`

## Production Setup

### 1. Get Webhook Secret from Stripe Dashboard
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**
4. Enter your webhook URL: `https://yourdomain.com/api/webhooks/stripe`
5. Select events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded` (optional, for completeness)
6. Copy the **Signing secret** (starts with `whsec_...`)

### 2. Set Environment Variable
Add to your production `.env` file:
```bash
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### 3. Test Webhook Delivery
1. Use Stripe Dashboard → **Webhooks** → **Send test webhook**
2. Select `checkout.session.completed` event
3. Check your server logs to verify it's received and processed

## What the Webhook Does

When a payment is completed:

1. **Finds the payment record** by:
   - Payment link ID from checkout session
   - Ticket ID from session metadata
   - Falls back to most recent pending payment for the ticket

2. **Updates payment status**:
   - Sets `status = "COMPLETED"`
   - Sets `completedAt = now()`
   - Stores checkout session ID in metadata

3. **Updates ticket**:
   - Recalculates `amountPaidCents` from all completed payments

4. **Sends confirmation SMS**:
   - "Payment confirmed! You paid $X.XX for ticket #[number]. Reply YES to request your car now."

5. **Creates audit log**:
   - Records payment completion with details

## Troubleshooting

### Webhook Not Receiving Events
- Check Stripe Dashboard → Webhooks → Recent deliveries
- Verify webhook URL is correct and accessible
- Check server logs for errors
- For local testing, ensure Stripe CLI is running and forwarding

### Payment Not Updating
- Check server logs for webhook processing
- Verify payment record exists with matching `ticketId` and `tenantId`
- Check that payment status is `PENDING` or `PAYMENT_LINK_SENT`
- Verify webhook signature (if using production secret)

### Signature Verification Failing
- Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
- For local testing with Stripe CLI, use the secret shown by `stripe listen`
- Make sure webhook endpoint uses `express.raw()` middleware (already configured)

## Next Steps

After webhook is working:
1. Implement payment confirmation page with "Request Car Now" button
2. Add pickup request handling in webhook (check for pickup request when payment completes)
3. Implement PWA push notifications for staff when cars are ready


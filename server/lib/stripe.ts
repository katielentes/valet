import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const hasStripeConfig = Boolean(stripeSecretKey);

export function getStripeClient() {
  if (!stripeSecretKey) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
  });
}


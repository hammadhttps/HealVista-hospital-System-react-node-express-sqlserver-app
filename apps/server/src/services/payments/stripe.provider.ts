import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import {
  PaymentProviderUnavailable,
  type PaymentIntent,
  type PaymentProvider,
  type RefundResult,
  type VerifiedWebhookEvent,
} from "./PaymentProvider.js";

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new PaymentProviderUnavailable("stripe");
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/** Stripe works in the smallest currency unit — 12.34 USD is 1234 cents. */
function toMinorUnits(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function fromMinorUnits(minor: number): string {
  return (minor / 100).toFixed(2);
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createIntent({ amount, currency, billId, patientEmail }): Promise<PaymentIntent> {
    const intent = await stripe().paymentIntents.create({
      amount: toMinorUnits(amount),
      currency: currency.toLowerCase(),
      // Read back on the webhook so a payment can always be tied to its bill even
      // if the client never returns from the checkout page.
      metadata: { billId },
      ...(patientEmail ? { receipt_email: patientEmail } : {}),
      automatic_payment_methods: { enabled: true },
    });

    if (!intent.client_secret) {
      throw new AppError("Stripe did not return a client secret", 502);
    }

    return {
      providerRef: intent.id,
      clientSecret: intent.client_secret,
      amount,
      currency,
    };
  },

  async refund({ providerRef, amount }): Promise<RefundResult> {
    const refund = await stripe().refunds.create({
      payment_intent: providerRef,
      ...(amount ? { amount: toMinorUnits(amount) } : {}),
    });

    return {
      refundRef: refund.id,
      amount: fromMinorUnits(refund.amount ?? 0),
    };
  },

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedWebhookEvent {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new PaymentProviderUnavailable("stripe");

    let event: Stripe.Event;
    try {
      // Must be the raw body — any JSON parse/re-stringify breaks the signature.
      event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new AppError(
        `Stripe webhook signature verification failed: ${(err as Error).message}`,
        400,
      );
    }

    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          eventId: event.id,
          type: "payment_succeeded",
          providerRef: intent.id,
          amount: fromMinorUnits(intent.amount_received || intent.amount),
        };
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          eventId: event.id,
          type: "payment_failed",
          providerRef: intent.id,
          amount: fromMinorUnits(intent.amount),
        };
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        return {
          eventId: event.id,
          type: "refunded",
          providerRef:
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : (charge.payment_intent?.id ?? null),
          amount: fromMinorUnits(charge.amount_refunded),
        };
      }
      default:
        // Acknowledged and recorded, but billing does nothing with it. Returning
        // 200 for unknown types stops Stripe retrying forever.
        return { eventId: event.id, type: "ignored", providerRef: null, amount: null };
    }
  },
};

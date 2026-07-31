import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import {
  PaymentProviderUnavailable,
  type PaymentIntent,
  type PaymentProvider,
  type RefundResult,
  type VerifiedWebhookEvent,
} from "./PaymentProvider.js";

let client: Razorpay | null = null;

function razorpay(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new PaymentProviderUnavailable("razorpay");
  }
  client ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return client;
}

/** Razorpay also works in the smallest currency unit. */
function toMinorUnits(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function fromMinorUnits(minor: number): string {
  return (minor / 100).toFixed(2);
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createIntent({ amount, currency, billId }): Promise<PaymentIntent> {
    const order = await razorpay().orders.create({
      amount: toMinorUnits(amount),
      currency: currency.toUpperCase(),
      notes: { billId },
    });

    return {
      providerRef: order.id,
      // Razorpay's checkout takes the order id rather than a secret; the field is
      // named for the interface, and the client SDK treats it the same way.
      clientSecret: order.id,
      amount,
      currency,
    };
  },

  async refund({ providerRef, amount }): Promise<RefundResult> {
    // `providerRef` is the order id; refunds are issued against the payment id
    // captured for that order.
    const payments = await razorpay().orders.fetchPayments(providerRef);
    const captured = payments.items?.find((p: { status: string }) => p.status === "captured");
    if (!captured) throw new AppError("No captured Razorpay payment found for this order", 404);

    const refund = await razorpay().payments.refund(captured.id, {
      ...(amount ? { amount: toMinorUnits(amount) } : {}),
    });

    return {
      refundRef: refund.id,
      amount: fromMinorUnits(Number(refund.amount ?? 0)),
    };
  },

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedWebhookEvent {
    if (!env.RAZORPAY_WEBHOOK_SECRET) throw new PaymentProviderUnavailable("razorpay");

    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    // timingSafeEqual throws on a length mismatch, so guard before comparing.
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new AppError("Razorpay webhook signature verification failed", 400);
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      event: string;
      payload?: {
        payment?: { entity?: { id: string; order_id: string; amount: number } };
        refund?: { entity?: { id: string; amount: number; payment_id: string } };
      };
    };

    // Razorpay has no per-delivery event id, so key idempotency on the entity id
    // plus event name — stable across retries of the same event.
    const paymentEntity = payload.payload?.payment?.entity;
    const refundEntity = payload.payload?.refund?.entity;

    switch (payload.event) {
      case "payment.captured":
        return {
          eventId: `${payload.event}:${paymentEntity?.id ?? "unknown"}`,
          type: "payment_succeeded",
          providerRef: paymentEntity?.order_id ?? null,
          amount: paymentEntity ? fromMinorUnits(paymentEntity.amount) : null,
        };
      case "payment.failed":
        return {
          eventId: `${payload.event}:${paymentEntity?.id ?? "unknown"}`,
          type: "payment_failed",
          providerRef: paymentEntity?.order_id ?? null,
          amount: paymentEntity ? fromMinorUnits(paymentEntity.amount) : null,
        };
      case "refund.processed":
        return {
          eventId: `${payload.event}:${refundEntity?.id ?? "unknown"}`,
          type: "refunded",
          providerRef: null,
          amount: refundEntity ? fromMinorUnits(refundEntity.amount) : null,
        };
      default:
        return {
          eventId: `${payload.event}:${paymentEntity?.id ?? refundEntity?.id ?? "unknown"}`,
          type: "ignored",
          providerRef: null,
          amount: null,
        };
    }
  },
};

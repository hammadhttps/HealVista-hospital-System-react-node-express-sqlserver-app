/**
 * One interface, two gateways.
 *
 * Nothing outside `payments/*.provider.ts` may import a gateway SDK — call sites
 * depend on this interface only. That keeps Stripe and Razorpay interchangeable and
 * lets tests substitute a fake without network access.
 */

export interface PaymentIntent {
  /** The gateway's own id for this attempt. Stored as `Payment.providerRef`. */
  providerRef: string;
  /** Passed to the client SDK to complete the payment. */
  clientSecret: string;
  amount: string;
  currency: string;
}

export interface RefundResult {
  refundRef: string;
  amount: string;
}

/** A webhook that has been verified and normalised into terms billing understands. */
export interface VerifiedWebhookEvent {
  /** The gateway's event id — the idempotency key. */
  eventId: string;
  type: "payment_succeeded" | "payment_failed" | "refunded" | "ignored";
  providerRef: string | null;
  amount: string | null;
}

export interface PaymentProvider {
  readonly name: "stripe" | "razorpay";

  createIntent(params: {
    amount: string;
    currency: string;
    billId: string;
    patientEmail?: string;
  }): Promise<PaymentIntent>;

  refund(params: { providerRef: string; amount?: string }): Promise<RefundResult>;

  /**
   * Verifies the signature against the **raw** body and normalises the payload.
   * Throws if the signature does not match — never trust an unverified webhook.
   */
  verifyWebhook(rawBody: Buffer, signature: string): VerifiedWebhookEvent;
}

/** Thrown when a gateway is called without its credentials configured. */
export class PaymentProviderUnavailable extends Error {
  constructor(provider: string) {
    super(
      `The ${provider} payment provider is not configured. Set its API keys, or take payment as cash.`,
    );
    this.name = "PaymentProviderUnavailable";
  }
}

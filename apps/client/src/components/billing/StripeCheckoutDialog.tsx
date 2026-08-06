import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCreatePaymentIntent } from "../../hooks/mutations/useBillingMutations";
import { billKeys, paymentKeys } from "../../hooks/queries/useBilling";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { getErrorMessage } from "../../utils/errors";

/**
 * Stripe.js is an ~300KB fetch. It is only needed while the checkout dialog is
 * open, so we defer loading the SDK until the first open instead of loading it
 * when the billing page mounts. The resolved Stripe instance is cached and
 * reused across opens.
 */
let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Defensive guard: if a Google Fonts <link> is ever present on the host page,
 * remove it before Stripe loads. With `theme: "none"` (see CHECKOUT_APPEARANCE)
 * Stripe no longer font-syncs the host page's font, so this is belt-and-suspenders
 * against a regression that would re-introduce the CSP violation.
 */
function stripStrayGoogleFonts(): void {
  for (const el of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
    const href = el.getAttribute("href") ?? "";
    if (href.includes("fonts.googleapis.com")) {
      el.remove();
    }
  }
}

function getStripePromise(): Promise<Stripe | null> | null {
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripStrayGoogleFonts();
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * Preloads the Stripe.js SDK early so it is cached by the time the user opens
 * the checkout dialog. See CHECKOUT_APPEARANCE for the appearance config that
 * prevents Stripe from loading its default font from Google Fonts.
 */
export function preloadStripe(): void {
  getStripePromise();
}

/**
 * An explicit `appearance` serves two purposes:
 * - `theme: "none"` prevents Stripe from loading its default font (Mulish) from
 *   Google Fonts inside its sandboxed iframe. Stripe's own CSP
 *   (`style-src 'self'`) blocks that load, which surfaces as the noisy "style-src"
 *   CSP violation and the "message channel closed" race that breaks the payment
 *   flow. Self-hosting Geist and setting `fontFamily` keeps the UI consistent
 *   without triggering the external font load at all.
 * - It matches the on-brand teal accents instead of Stripe's defaults.
 */
const CHECKOUT_APPEARANCE = {
  appearance: {
    theme: "none" as "stripe" | "night" | "flat",
    variables: {
      colorPrimary: "#0f766e",
      colorBackground: "#ffffff",
      colorText: "#1a2e2b",
      colorDanger: "#b91c1c",
      borderRadius: "6px",
      fontFamily:
        '"Inter", "Geist", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
  },
  loader: "auto",
} as const;

function CheckoutForm({
  clientSecret,
  onSuccess,
  onCancel,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["billing", "common"]);
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/billing/payments`,
        },
        redirect: "if_required",
      });

      if (error) {
        toast.error(getErrorMessage(error, t("billing:paymentFailed")));
      } else {
        toast.success(t("billing:paymentSubmitted"));
        onSuccess();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t("billing:paymentFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t("common:cancel")}
        </Button>
        <Button type="submit" disabled={submitting || !stripe || !elements}>
          {submitting ? t("billing:processing") : t("billing:payCard")}
        </Button>
      </div>
    </form>
  );
}

export default function StripeCheckoutDialog({
  billId,
  balance,
  open,
  onOpenChange,
}: {
  billId: string;
  balance: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation(["billing", "common"]);
  const createIntent = useCreatePaymentIntent();
  const queryClient = useQueryClient();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const preparedForRef = useRef<string | null>(null);

  const canUseStripe = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  const { mutateAsync, reset: resetIntent } = createIntent;

  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) onOpenChange(nextOpen);
  };

  /**
   * Requests a fresh PaymentIntent for the selected bill. Its deps are the bill
   * and `mutateAsync` (stable for the lifetime of the hook), so its identity only
   * changes when a different bill/amount is selected — never when the mutation
   * itself moves between idle/pending/success/error.
   */
  const prepareIntent = useCallback(async () => {
    // Kick off the SDK fetch and the intent request in parallel — Stripe.js
    // takes the longest to arrive, so warming it now (not when the dialog has
    // already been rendered) hides most of its latency.
    const [intent] = await Promise.all([
      mutateAsync({ billId, amount: balance, provider: "stripe" }),
      getStripePromise(),
    ]);
    setClientSecret(intent.clientSecret);
  }, [billId, balance, mutateAsync]);

  useEffect(() => {
    if (!open || !canUseStripe) {
      preparedForRef.current = null;
      setClientSecret(null);
      return;
    }
    // Exactly one intent per open. Without this guard the mutation's own state
    // transitions re-render the component and re-run the effect, which fires a
    // new create-intent request on every loop — flooding the API and, when the
    // gateway is down, retrying forever (net::ERR_INSUFFICIENT_RESOURCES).
    if (preparedForRef.current === billId) return;
    preparedForRef.current = billId;
    setClientSecret(null);
    void prepareIntent().catch(() => {
      // The failure is rendered from createIntent.error. Deliberately not retried
      // here: a failing gateway must surface an error, not spawn requests.
    });
  }, [open, canUseStripe, billId, prepareIntent]);

  const retryIntent = () => {
    preparedForRef.current = null;
    setClientSecret(null);
    resetIntent();
    void prepareIntent();
  };

  if (!canUseStripe) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("billing:payCard")}</DialogTitle>
            <DialogDescription>{t("billing:stripeUnavailable")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button disabled>{t("billing:payCard")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const stripeInstance = getStripePromise();

  // Loading: the Stripe.js fetch, the intent round-trip, or both are in flight.
  if (!stripeInstance || (!clientSecret && !createIntent.isError)) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("billing:payCard")}</DialogTitle>
            <DialogDescription>{t("billing:preparingCheckout")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button disabled>{t("billing:payCard")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // The intent could not be created (unconfigured gateway, declined card, Stripe
  // outage). Show why and let the user retry manually — never auto-retry in a loop.
  if (!clientSecret) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("billing:payCard")}</DialogTitle>
            <DialogDescription role="alert">
              {getErrorMessage(createIntent.error, t("billing:paymentFailed"))}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common:cancel")}
            </Button>
            <Button onClick={retryIntent}>{t("common:retry")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("billing:payCard")}</DialogTitle>
          <DialogDescription>{t("billing:payAmount", { amount: balance })}</DialogDescription>
        </DialogHeader>
        <Elements stripe={stripeInstance} options={{ ...CHECKOUT_APPEARANCE, clientSecret }}>
          <CheckoutForm
            clientSecret={clientSecret}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: billKeys.all });
              queryClient.invalidateQueries({ queryKey: paymentKeys.all });
              handleOpenChange(false);
            }}
            onCancel={() => handleOpenChange(false)}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}

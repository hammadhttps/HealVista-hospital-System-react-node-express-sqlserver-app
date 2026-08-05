import { useEffect, useState, type FormEvent } from "react";
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

function getStripePromise(): Promise<Stripe | null> | null {
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * An explicit `appearance` serves two purposes:
 * - It disables Stripe's automatic font-sync. Without it Stripe detects the
 *   host page's font (Mulish) and tries to reload it from Google Fonts inside
 *   its sandboxed iframe, where Stripe's own CSP blocks the stylesheet. That
 *   blocked load is what surfaces as the CSP violation and the "message channel
 *   closed" race in the console — they look alarming, but disabling font-sync
 *   removes the cause entirely.
 * - It matches the on-brand teal accents instead of Stripe's defaults.
 */
const CHECKOUT_APPEARANCE = {
  appearance: {
    theme: "stripe",
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
  const [isPreparing, setIsPreparing] = useState(false);

  const canUseStripe = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open || !canUseStripe) {
      return;
    }

    let cancelled = false;
    const prepare = async () => {
      setIsPreparing(true);
      // Kick off the SDK fetch and the intent request in parallel — Stripe.js
      // takes the longest to arrive, so warming it now (not when the dialog has
      // already been rendered) hides most of its latency.
      const sdk = getStripePromise();
      try {
        const [intent] = await Promise.all([
          createIntent.mutateAsync({ billId, amount: balance, provider: "stripe" }),
          sdk,
        ]);
        if (!cancelled) {
          setClientSecret(intent.clientSecret);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(getErrorMessage(error, t("billing:paymentFailed")));
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false);
        }
      }
    };

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [open, canUseStripe, billId, balance, createIntent, t]);

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

  if (!getStripePromise() || !clientSecret) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("billing:payCard")}</DialogTitle>
          <DialogDescription>{t("billing:payAmount", { amount: balance })}</DialogDescription>
        </DialogHeader>
        <Elements stripe={getStripePromise()} options={{ ...CHECKOUT_APPEARANCE, clientSecret }}>
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

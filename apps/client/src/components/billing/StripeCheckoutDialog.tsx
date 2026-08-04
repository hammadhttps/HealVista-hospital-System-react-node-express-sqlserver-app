import { useEffect, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCreatePaymentIntent } from "../../hooks/mutations/useBillingMutations";
import { billKeys, paymentKeys } from "../../hooks/queries/useBilling";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { getErrorMessage } from "../../utils/errors";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

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
      try {
        const intent = await createIntent.mutateAsync({ billId, amount: balance, provider: "stripe" });
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
            <DialogDescription>
              {t("billing:stripeUnavailable")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button disabled>{t("billing:payCard")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!stripePromise || !clientSecret) {
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
          <DialogDescription>
            {t("billing:payAmount", { amount: balance })}
          </DialogDescription>
        </DialogHeader>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
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

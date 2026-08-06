import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import StripeCheckoutDialog from "./StripeCheckoutDialog";
import { paymentApi } from "../../api/billing";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "billing:payCard": "Pay card",
        "billing:stripeUnavailable": "Online card payments are currently unavailable.",
        "billing:preparingCheckout": "Preparing secure checkout…",
        "billing:paymentFailed": "Payment failed",
        "common:cancel": "Cancel",
        "common:retry": "Retry",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/billing")>();
  return {
    ...actual,
    paymentApi: { ...actual.paymentApi, createIntent: vi.fn() },
  };
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("StripeCheckoutDialog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows an unavailable state when the publishable key is not configured", () => {
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "");
    renderWithClient(<StripeCheckoutDialog open billId="bill-1" balance="120.00" />);

    expect(screen.getByText(/Online card payments are currently unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay card/i })).toBeDisabled();
  });

  it("creates exactly one PaymentIntent per open and surfaces the error instead of retrying", async () => {
    vi.stubEnv("VITE_STRIPE_PUBLISHABLE_KEY", "pk_test_123");
    const createIntent = vi.fn().mockRejectedValue(new Error("stripe unavailable"));
    vi.mocked(paymentApi.createIntent).mockImplementation(createIntent);

    renderWithClient(<StripeCheckoutDialog open billId="bill-1" balance="120.00" />);

    // The failure must render as an error with a manual Retry action…
    expect(await screen.findByRole("alert")).toHaveTextContent("stripe unavailable");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    // …and must NOT fire again on the mutation's state transitions (idle →
    // pending → error). The old code re-ran the effect on every state change,
    // looping POST /api/payments/create-intent until ERR_INSUFFICIENT_RESOURCES.
    expect(createIntent).toHaveBeenCalledTimes(1);
  });
});

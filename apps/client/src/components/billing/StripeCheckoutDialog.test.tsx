import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import StripeCheckoutDialog from "./StripeCheckoutDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "billing:payCard": "Pay card",
        "billing:stripeUnavailable": "Online card payments are currently unavailable.",
        "common:cancel": "Cancel",
      };
      return map[key] ?? key;
    },
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("StripeCheckoutDialog", () => {
  it("shows an unavailable state when the publishable key is not configured", () => {
    renderWithClient(<StripeCheckoutDialog open billId="bill-1" balance="120.00" />);

    expect(screen.getByText(/Online card payments are currently unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay card/i })).toBeDisabled();
  });
});

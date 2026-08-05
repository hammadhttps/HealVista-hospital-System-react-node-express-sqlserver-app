import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { toast } from "sonner";
import { useBills, useDiscounts } from "../hooks/queries/useBilling";
import {
  useApplyDiscount,
  useFinaliseBill,
  useRecordCashPayment,
} from "../hooks/mutations/useBillingMutations";
import { billApi } from "../api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { getErrorMessage } from "../utils/errors";
import { previewDiscount } from "../lib/billingPreview";
import StripeCheckoutDialog, { preloadStripe } from "../components/billing/StripeCheckoutDialog";

const STATUS_TABS = [
  { value: "", key: "common:all" },
  { value: "draft", key: "billing:drafts" },
  { value: "finalised", key: "billing:due" },
  { value: "partially_paid", key: "billing:partlyPaid" },
  { value: "paid", key: "billing:paid" },
];

const statusVariant: Record<string, string> = {
  draft: "secondary",
  finalised: "warning",
  partially_paid: "info",
  paid: "success",
  void: "destructive",
};

export default function BillingConsole() {
  const { t } = useTranslation(["billing", "common", "nav"]);
  const [tab, setTab] = useState("");

  useEffect(() => {
    preloadStripe();
  }, []);

  const [cashAmounts, setCashAmounts] = useState<Record<string, string>>({});
  const [previewDiscounts, setPreviewDiscounts] = useState<Record<string, string>>({});
  const [checkoutBill, setCheckoutBill] = useState<{ id: string; balance: string } | null>(null);

  const filters = tab ? { status: tab } : {};
  const { data, isLoading, isError } = useBills(filters);
  const { data: discounts } = useDiscounts(true);

  const finalise = useFinaliseBill();
  const applyDiscount = useApplyDiscount();
  const recordCash = useRecordCashPayment();

  const bills = data?.data ?? [];

  const handleFinalise = (id: string) => {
    finalise.mutate(id, {
      onSuccess: () => toast.success(t("billing:billFinalised")),
      onError: (err) => toast.error(getErrorMessage(err, t("billing:finaliseFailed"))),
    });
  };

  const handleDiscount = (id: string, discountId: string) => {
    if (!discountId) return;
    applyDiscount.mutate(
      { id, discountId },
      {
        onSuccess: () => {
          toast.success(t("billing:discountApplied"));
          setPreviewDiscounts((prev) => ({ ...prev, [id]: "" }));
        },
        onError: (err) => toast.error(getErrorMessage(err, t("billing:applyDiscountFailed"))),
      },
    );
  };

  const handleCash = (billId: string) => {
    const amount = (cashAmounts[billId] ?? "").trim();
    if (!amount) return;

    recordCash.mutate(
      { billId, amount },
      {
        onSuccess: () => {
          toast.success(t("billing:cashRecorded", { amount }));
          setCashAmounts((prev) => ({ ...prev, [billId]: "" }));
        },
        onError: (err) => toast.error(getErrorMessage(err, t("billing:recordPaymentFailed"))),
      },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("nav:billing")}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {STATUS_TABS.map((tabItem) => (
            <TabsTrigger key={tabItem.value} value={tabItem.value}>
              {t(tabItem.key)}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((tabItem) => (
          <TabsContent key={tabItem.value} value={tabItem.value} className="space-y-4">
            {isLoading && (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            )}

            {isError && (
              <EmptyState title={t("billing:loadFailed")} description={t("common:errorBody")} />
            )}

            {!isLoading && !isError && bills.length === 0 && (
              <EmptyState title={t("billing:noBills")} description={t("billing:nothingMatches")} />
            )}

            {!isLoading &&
              bills.map((bill: any) => (
                <Card key={bill.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-lg">
                      {bill.billNumber}
                      <span className="ml-3 text-sm font-normal text-muted-foreground">
                        {bill.patient?.fullName} · MRN {bill.patient?.mrn}
                      </span>
                    </CardTitle>
                    <Badge variant={statusVariant[bill.status] as any}>{bill.status}</Badge>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                      <span>
                        {t("billing:total")}: <strong>{Number(bill.total).toFixed(2)}</strong>
                      </span>
                      <span>
                        {t("billing:paid")}: {Number(bill.amountPaid).toFixed(2)}
                      </span>
                      <span>
                        {t("billing:balance")}: <strong>{Number(bill.balance).toFixed(2)}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(bill.createdAt), "d MMM yyyy")}
                      </span>
                    </div>

                    {bill.status === "draft" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                          value={previewDiscounts[bill.id] ?? ""}
                          disabled={!!bill.discountId || applyDiscount.isPending}
                          onChange={(e) =>
                            setPreviewDiscounts((prev) => ({
                              ...prev,
                              [bill.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {bill.discountId
                              ? t("billing:discount", { name: bill.discount?.name })
                              : t("billing:applyDiscount")}
                          </option>
                          {(discounts ?? []).map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.type === "percentage" ? `${d.value}%` : d.value})
                            </option>
                          ))}
                        </select>

                        {(() => {
                          const picked = (discounts ?? []).find(
                            (d: { id: string; type: string; value: string }) =>
                              d.id === (previewDiscounts[bill.id] ?? ""),
                          );
                          if (!picked || bill.discountId) return null;
                          const preview = previewDiscount(bill, {
                            type: picked.type === "percentage" ? "percentage" : "fixed",
                            value: picked.value,
                          });
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {t("billing:discountPreview", {
                                  total: preview.total.toFixed(2),
                                  savings: preview.savings.toFixed(2),
                                })}
                              </span>
                              <Button
                                size="sm"
                                onClick={() => handleDiscount(bill.id, picked.id)}
                                disabled={applyDiscount.isPending}
                              >
                                {t("billing:confirmDiscount")}
                              </Button>
                            </div>
                          );
                        })()}

                        <Button
                          size="sm"
                          onClick={() => handleFinalise(bill.id)}
                          disabled={finalise.isPending}
                        >
                          {t("billing:finalise")}
                        </Button>
                      </div>
                    )}

                    {(bill.status === "finalised" || bill.status === "partially_paid") && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="max-w-[160px]"
                          inputMode="decimal"
                          placeholder={t("billing:cashPlaceholder", {
                            max: Number(bill.balance).toFixed(2),
                          })}
                          value={cashAmounts[bill.id] ?? ""}
                          onChange={(e) =>
                            setCashAmounts((prev) => ({ ...prev, [bill.id]: e.target.value }))
                          }
                          onKeyDown={(e) => e.key === "Enter" && handleCash(bill.id)}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleCash(bill.id)}
                          disabled={recordCash.isPending || !(cashAmounts[bill.id] ?? "").trim()}
                        >
                          {t("billing:recordCash")}
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(billApi.pdfUrl(bill.id), "_blank", "noopener")}
                      >
                        {t("billing:invoicePdf")}
                      </Button>
                      {Number(bill.balance) > 0 &&
                        (bill.status === "finalised" || bill.status === "partially_paid") && (
                          <Button
                            size="sm"
                            onClick={() => setCheckoutBill({ id: bill.id, balance: bill.balance })}
                          >
                            {t("billing:payCard")}
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </TabsContent>
        ))}
      </Tabs>

      <StripeCheckoutDialog
        open={Boolean(checkoutBill)}
        billId={checkoutBill?.id ?? ""}
        balance={checkoutBill?.balance ?? "0.00"}
        onOpenChange={(open) => {
          if (!open) setCheckoutBill(null);
        }}
      />
    </div>
  );
}

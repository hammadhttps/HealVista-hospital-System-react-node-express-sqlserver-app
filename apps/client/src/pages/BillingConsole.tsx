import { useState } from "react";
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

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "finalised", label: "Due" },
  { value: "partially_paid", label: "Partly paid" },
  { value: "paid", label: "Paid" },
];

const statusVariant: Record<string, string> = {
  draft: "secondary",
  finalised: "warning",
  partially_paid: "info",
  paid: "success",
  void: "destructive",
};

export default function BillingConsole() {
  const [tab, setTab] = useState("");
  const [cashAmounts, setCashAmounts] = useState<Record<string, string>>({});

  const filters = tab ? { status: tab } : {};
  const { data, isLoading, isError } = useBills(filters);
  const { data: discounts } = useDiscounts(true);

  const finalise = useFinaliseBill();
  const applyDiscount = useApplyDiscount();
  const recordCash = useRecordCashPayment();

  const bills = data?.data ?? [];

  const handleFinalise = (id: string) => {
    finalise.mutate(id, {
      onSuccess: () => toast.success("Bill finalised"),
      onError: (err) => toast.error(getErrorMessage(err, "Could not finalise the bill")),
    });
  };

  const handleDiscount = (id: string, discountId: string) => {
    if (!discountId) return;
    applyDiscount.mutate(
      { id, discountId },
      {
        onSuccess: () => toast.success("Discount applied"),
        onError: (err) => toast.error(getErrorMessage(err, "Could not apply the discount")),
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
          toast.success(`Cash payment of ${amount} recorded`);
          setCashAmounts((prev) => ({ ...prev, [billId]: "" }));
        },
        onError: (err) => toast.error(getErrorMessage(err, "Could not record the payment")),
      },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="space-y-4">
            {isLoading && (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            )}

            {isError && (
              <EmptyState
                title="Could not load bills"
                description="Something went wrong. Try refreshing the page."
              />
            )}

            {!isLoading && !isError && bills.length === 0 && (
              <EmptyState title="No bills here" description="Nothing matches this filter." />
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
                      <span>Total: <strong>{Number(bill.total).toFixed(2)}</strong></span>
                      <span>Paid: {Number(bill.amountPaid).toFixed(2)}</span>
                      <span>
                        Balance: <strong>{Number(bill.balance).toFixed(2)}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(bill.createdAt), "d MMM yyyy")}
                      </span>
                    </div>

                    {bill.status === "draft" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                          defaultValue=""
                          disabled={!!bill.discountId || applyDiscount.isPending}
                          onChange={(e) => handleDiscount(bill.id, e.target.value)}
                        >
                          <option value="">
                            {bill.discountId ? `Discount: ${bill.discount?.name}` : "Apply discount…"}
                          </option>
                          {(discounts ?? []).map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.type === "percentage" ? `${d.value}%` : d.value})
                            </option>
                          ))}
                        </select>

                        <Button
                          size="sm"
                          onClick={() => handleFinalise(bill.id)}
                          disabled={finalise.isPending}
                        >
                          Finalise
                        </Button>
                      </div>
                    )}

                    {(bill.status === "finalised" || bill.status === "partially_paid") && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="max-w-[160px]"
                          inputMode="decimal"
                          placeholder={`Cash (max ${Number(bill.balance).toFixed(2)})`}
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
                          Record cash
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(billApi.pdfUrl(bill.id), "_blank", "noopener")}
                      >
                        Invoice PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

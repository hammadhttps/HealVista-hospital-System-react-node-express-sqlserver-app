import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { usePaymentHistory } from "../hooks/queries/useBilling";
import { paymentApi } from "../api/billing";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";

const METHODS = ["", "CASH", "CARD", "BANK_TRANSFER", "WALLET", "INSURANCE"];

const statusVariant: Record<string, string> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  REFUNDED: "secondary",
  PARTIAL: "info",
};

export default function PaymentHistory() {
  const { t } = useTranslation(["billing", "common"]);
  const [method, setMethod] = useState("");
  const filters = method ? { method } : {};
  const { data, isLoading, isError } = usePaymentHistory(filters);

  const payments = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("billing:paymentHistory")}</h1>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m === "" ? t("billing:allMethods") : m.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState title={t("billing:paymentsLoadFailed")} description={t("common:errorBody")} />
      )}

      {!isLoading && !isError && payments.length === 0 && (
        <EmptyState title={t("billing:noPayments")} description={t("billing:nothingMatches")} />
      )}

      {!isLoading && payments.length > 0 && (
        <div className="space-y-2">
          {payments.map((p: any) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {Number(p.amount).toFixed(2)}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {p.method.replace("_", " ")}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {p.bill?.billNumber} · {p.bill?.patient?.fullName}
                    {" · "}
                    {format(new Date(p.createdAt), "d MMM yyyy HH:mm")}
                  </p>
                  {p.receivedByEmail && (
                    <p className="text-xs text-muted-foreground">
                      {t("billing:receivedBy", { email: p.receivedByEmail })}
                    </p>
                  )}
                  {p.reference && (
                    <p className="text-xs text-muted-foreground">
                      {t("billing:reference", { reference: p.reference })}
                    </p>
                  )}
                  {Number(p.refundedAmount) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("billing:refunded", { amount: Number(p.refundedAmount).toFixed(2) })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[p.status] as any}>{p.status}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(paymentApi.receiptUrl(p.id), "_blank", "noopener")}
                  >
                    {t("billing:receipt")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

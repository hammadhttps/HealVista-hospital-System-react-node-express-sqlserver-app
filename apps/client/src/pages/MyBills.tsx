import { useTranslation } from "react-i18next";
import { useMyBills } from "../hooks/queries/useBilling";
import { billApi } from "../api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { format } from "date-fns";

const statusVariant: Record<string, string> = {
  draft: "secondary",
  finalised: "warning",
  partially_paid: "info",
  paid: "success",
  void: "destructive",
};

const statusKey: Record<string, string> = {
  draft: "statusDraft",
  finalised: "statusDue",
  partially_paid: "statusPartlyPaid",
  paid: "statusPaid",
  void: "statusVoid",
};

export default function MyBills() {
  const { t } = useTranslation(["common", "bills"]);
  const { data, isLoading, isError } = useMyBills();

  const bills = data?.bills ?? [];
  const outstanding = data?.outstandingBalance ?? "0.00";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("bills:title")}</h1>
        {!isLoading && !isError && (
          <Card className="min-w-[220px]">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{t("bills:outstandingBalance")}</p>
              <p className="text-2xl font-bold">{outstanding}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState title={t("bills:loadFailed")} description={t("bills:loadFailedHint")} />
      )}

      {!isLoading && !isError && bills.length === 0 && (
        <EmptyState title={t("bills:empty")} description={t("bills:emptyHint")} />
      )}

      {!isLoading && bills.length > 0 && (
        <div className="space-y-4">
          {bills.map((bill: any) => (
            <Card key={bill.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">{bill.billNumber}</CardTitle>
                <Badge variant={statusVariant[bill.status] as any}>
                  {statusKey[bill.status] ? t(`bills:${statusKey[bill.status]}`) : bill.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("bills:issued", {
                    date: format(new Date(bill.createdAt), "d MMM yyyy"),
                  })}
                </p>

                <ul className="space-y-1 text-sm">
                  {bill.items?.map((item: any) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.description}
                        {item.quantity > 1 && ` × ${item.quantity}`}
                      </span>
                      <span>{Number(item.amount).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t pt-2 text-sm">
                  {Number(bill.discountAmount) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>
                        {t("bills:discount")}
                        {bill.discount?.name ? ` (${bill.discount.name})` : ""}
                      </span>
                      <span>- {Number(bill.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(bill.insuranceCovered) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t("bills:insuranceCovered")}</span>
                      <span>- {Number(bill.insuranceCovered).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                    <span>{t("bills:total")}</span>
                    <span>{Number(bill.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("bills:paid")}</span>
                    <span>{Number(bill.amountPaid).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>{t("bills:balanceDue")}</span>
                    <span>{Number(bill.balance).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(billApi.pdfUrl(bill.id), "_blank", "noopener")}
                  >
                    {t("bills:downloadInvoice")}
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

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

const statusLabel: Record<string, string> = {
  draft: "Draft",
  finalised: "Due",
  partially_paid: "Partly paid",
  paid: "Paid",
  void: "Void",
};

export default function MyBills() {
  const { data, isLoading, isError } = useMyBills();

  const bills = data?.bills ?? [];
  const outstanding = data?.outstandingBalance ?? "0.00";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My Bills</h1>
        {!isLoading && !isError && (
          <Card className="min-w-[220px]">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Outstanding balance</p>
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
        <EmptyState
          title="Could not load your bills"
          description="Something went wrong. Try refreshing the page."
        />
      )}

      {!isLoading && !isError && bills.length === 0 && (
        <EmptyState title="No bills yet" description="Bills appear here after a visit." />
      )}

      {!isLoading && bills.length > 0 && (
        <div className="space-y-4">
          {bills.map((bill: any) => (
            <Card key={bill.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">{bill.billNumber}</CardTitle>
                <Badge variant={statusVariant[bill.status] as any}>
                  {statusLabel[bill.status] ?? bill.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Issued {format(new Date(bill.createdAt), "d MMM yyyy")}
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
                      <span>Discount{bill.discount?.name ? ` (${bill.discount.name})` : ""}</span>
                      <span>- {Number(bill.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(bill.insuranceCovered) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Insurance covered</span>
                      <span>- {Number(bill.insuranceCovered).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>{Number(bill.total).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paid</span>
                    <span>{Number(bill.amountPaid).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Balance due</span>
                    <span>{Number(bill.balance).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(billApi.pdfUrl(bill.id), "_blank", "noopener")}
                  >
                    Download invoice
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

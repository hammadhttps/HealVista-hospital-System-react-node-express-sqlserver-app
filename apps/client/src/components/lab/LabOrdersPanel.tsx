import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical, RotateCcw } from "lucide-react";
import { useMyLabOrders, usePatientLabOrders } from "../../hooks/queries/useLabAndPharmacy";
import { useRetestLabOrder } from "../../hooks/mutations/useLabPharmacyMutations";
import LabExplainButton from "../ai/LabExplainButton";
import { format } from "date-fns";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyState } from "../primitives/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import LabOrderDialog from "./LabOrderDialog";

interface LabItem {
  id: string;
  resultValue: string | null;
  unit: string | null;
  flag: string | null;
  labTest: { name: string; code: string; sampleType?: string };
}

interface LabOrder {
  id: string;
  orderNumber: string;
  status: string;
  orderedAt: string;
  isRetest: boolean;
  items: LabItem[];
  doctor?: { fullName: string };
  patient?: { fullName: string; mrn: string };
}

const statusVariant: Record<
  string,
  "default" | "warning" | "secondary" | "outline" | "destructive"
> = {
  ORDERED: "secondary",
  SAMPLE_COLLECTED: "outline",
  TESTING: "warning",
  COMPLETED: "warning",
  VERIFIED: "default",
  CANCELLED: "destructive",
};

/** Out-of-range highlighting: flags are loud, CRITICAL is unmissable. */
function resultClass(flag: string | null): string {
  if (flag === "CRITICAL") return "font-bold text-red-700 bg-red-50 px-1 rounded";
  if (flag === "HIGH") return "font-semibold text-amber-700";
  if (flag === "LOW") return "font-semibold text-sky-700";
  return "";
}

/**
 * A patient's lab orders — shared by the staff per-patient view and the patient's
 * own results page. Result values are only present once the server decides they are
 * visible (patients see nothing until VERIFIED). Doctors can order and retest here.
 */
export default function LabOrdersPanel({
  patientId,
  mine = false,
  canOrder = false,
}: {
  patientId?: string;
  mine?: boolean;
  canOrder?: boolean;
}) {
  const [orderOpen, setOrderOpen] = useState(false);
  const [retestReason, setRetestReason] = useState("");
  const [retestOrderId, setRetestOrderId] = useState<string | null>(null);
  const retest = useRetestLabOrder();

  const mineOrders = useMyLabOrders();
  const patientOrders = usePatientLabOrders(mine ? "" : (patientId ?? ""));
  const orders = ((mine ? mineOrders.data : patientOrders.data) ?? []) as LabOrder[];
  const isLoading = mine ? mineOrders.isLoading : patientOrders.isLoading;

  const confirmRetest = (orderId: string) => {
    if (!retestReason.trim()) {
      toast.error("A retest needs a reason");
      return;
    }
    retest.mutate(
      { id: orderId, reason: retestReason.trim() },
      {
        onSuccess: () => {
          toast.success("Retest ordered");
          setRetestReason("");
          setRetestOrderId(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canOrder && (
          <Button size="sm" onClick={() => setOrderOpen(true)}>
            <FlaskConical className="h-4 w-4" /> Order lab tests
          </Button>
        )}
      </div>

      {isLoading && <Skeleton className="h-64" />}

      {!isLoading && orders.length === 0 && (
        <EmptyState
          title="No lab orders"
          description="Tests ordered for this patient appear here."
        />
      )}

      {!isLoading &&
        orders.map((order) => (
          <Card key={order.id}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{order.orderNumber}</span>
                  {order.isRetest && (
                    <Badge className="ml-2" variant="warning">
                      Retest
                    </Badge>
                  )}
                  <span className="ml-2 text-xs text-gray-500">
                    {format(new Date(order.orderedAt), "yyyy-MM-dd HH:mm")}
                    {order.patient ? ` · ${order.patient.fullName} (${order.patient.mrn})` : ""}
                    {order.doctor ? ` · Dr. ${order.doctor.fullName}` : ""}
                  </span>
                </div>
                <Badge variant={statusVariant[order.status] ?? "outline"}>{order.status}</Badge>
              </div>

              <div className="divide-y divide-gray-100">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-gray-700">
                      {item.labTest.name}{" "}
                      <span className="text-xs text-gray-400">{item.labTest.code}</span>
                    </span>
                    {item.resultValue === null ? (
                      <span className="text-xs text-gray-400">pending</span>
                    ) : (
                      <span className={resultClass(item.flag)}>
                        {item.resultValue} {item.unit ?? ""}
                        {item.flag ? ` [${item.flag}]` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {canOrder && ["COMPLETED", "VERIFIED"].includes(order.status) && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setRetestOrderId(order.id)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Retest
                  </Button>
                </div>
              )}

              {/* Explain only makes sense once there are numbers to explain. */}
              {order.items.some((i) => i.resultValue) && (
                <div className="mt-2 flex justify-end">
                  <LabExplainButton orderId={order.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

      {canOrder && (
        <LabOrderDialog patientId={patientId ?? ""} open={orderOpen} onOpenChange={setOrderOpen} />
      )}

      <RetestDialog
        orderId={retestOrderId}
        reason={retestReason}
        onReason={setRetestReason}
        onClose={() => setRetestOrderId(null)}
        onConfirm={confirmRetest}
        pending={retest.isPending}
      />
    </div>
  );
}

function RetestDialog({
  orderId,
  reason,
  onReason,
  onClose,
  onConfirm,
  pending,
}: {
  orderId: string | null;
  reason: string;
  onReason: (v: string) => void;
  onClose: () => void;
  onConfirm: (orderId: string) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Request a retest</DialogTitle>
          <DialogDescription>
            A new order will be created from this one, linked back to it.
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="min-h-20 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Why does this need to be re-run?"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
        />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => orderId && onConfirm(orderId)}>
            {pending ? "Ordering…" : "Order retest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

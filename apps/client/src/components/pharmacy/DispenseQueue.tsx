import { useState } from "react";
import { toast } from "sonner";
import { Pill } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDispenseQueue } from "../../hooks/queries/useLabAndPharmacy";
import { useDispense } from "../../hooks/mutations/useLabPharmacyMutations";
import { format } from "date-fns";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyState } from "../primitives/EmptyState";

interface QueueItem {
  id: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  quantityPrescribed: number;
  quantityDispensed: number;
}

interface QueuePrescription {
  id: string;
  dispenseStatus: "PENDING" | "PARTIAL";
  createdAt: string;
  items: QueueItem[];
  appointment: {
    patient: { fullName: string; mrn: string };
    doctor: { fullName: string };
  };
}

type Drafts = Record<string, Record<string, { quantity: number; batchNumber: string }>>;

const statusVariant: Record<string, "default" | "warning"> = {
  PENDING: "default",
  PARTIAL: "warning",
};

/**
 * The dispense queue — issued prescriptions still owing stock. Each item shows what
 * remains on the prescription and the pharmacist enters what they hand over now.
 * Dispensing is atomic server-side: stock and ledger move in one transaction.
 */
export default function DispenseQueue() {
  const { data, isLoading } = useDispenseQueue();
  const dispense = useDispense();
  const [drafts, setDrafts] = useState<Drafts>({});
  const { t } = useTranslation(["pharmacy", "common"]);

  const queue = Array.isArray(data) ? (data as QueuePrescription[]) : [];

  const remaining = (item: QueueItem) =>
    Math.max(0, item.quantityPrescribed - item.quantityDispensed);

  const setLine = (
    prescriptionId: string,
    itemId: string,
    patch: Partial<{ quantity: number; batchNumber: string }>,
  ) =>
    setDrafts((prev) => {
      const existing = prev[prescriptionId]?.[itemId] ?? {
        quantity: remaining(
          queue.find((p) => p.id === prescriptionId)?.items.find((i) => i.id === itemId)!,
        ),
        batchNumber: "",
      };
      return {
        ...prev,
        [prescriptionId]: {
          ...(prev[prescriptionId] ?? {}),
          [itemId]: { ...existing, ...patch },
        },
      };
    });

  const onDispense = (prescription: QueuePrescription) => {
    const lines = prescription.items
      .filter((i) => remaining(i) > 0)
      .map((i) => {
        const draft = drafts[prescription.id]?.[i.id];
        return {
          prescriptionItemId: i.id,
          quantity: draft?.quantity ?? remaining(i),
          batchNumber: draft?.batchNumber || undefined,
        };
      })
      .filter((l) => l.quantity > 0);

    if (lines.length === 0) {
      toast.error(t("pharmacy:nothingToDispense"));
      return;
    }

    dispense.mutate(
      { prescriptionId: prescription.id, lines },
      {
        onSuccess: () => {
          toast.success(t("pharmacy:dispensedToast"));
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[prescription.id];
            return next;
          });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-3">
      {isLoading && <Skeleton className="h-64" />}

      {!isLoading && queue.length === 0 && (
        <EmptyState title={t("pharmacy:queueClear")} description={t("pharmacy:queueClearHint")} />
      )}

      {!isLoading &&
        queue.map((prescription) => (
          <Card key={prescription.id}>
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {prescription.appointment.patient.fullName}
                    <span className="ml-2 text-xs text-gray-500">
                      MRN {prescription.appointment.patient.mrn}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Dr. {prescription.appointment.doctor.fullName} ·{" "}
                    {format(new Date(prescription.createdAt), "yyyy-MM-dd HH:mm")}
                  </div>
                </div>
                <Badge variant={statusVariant[prescription.dispenseStatus]}>
                  {prescription.dispenseStatus}
                </Badge>
              </div>

              <div className="space-y-2">
                {prescription.items.map((item) => {
                  const left = remaining(item);
                  const draft = drafts[prescription.id]?.[item.id];
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          <Pill className="h-3.5 w-3.5 text-gray-400" /> {item.medicineName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.dosage} · {item.frequency}
                          {item.quantityDispensed > 0 && (
                            <span className="text-gray-400">
                              {" "}
                              ({t("pharmacy:dispensedCount", { count: item.quantityDispensed })})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={left}
                          value={draft?.quantity ?? left}
                          disabled={left === 0}
                          onChange={(e) =>
                            setLine(prescription.id, item.id, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none disabled:opacity-40"
                        />
                        <span className="text-xs text-gray-500">
                          / {t("pharmacy:leftCount", { count: left })} left
                        </span>
                      </div>
                      <input
                        placeholder={t("pharmacy:batchPlaceholder")}
                        value={draft?.batchNumber ?? ""}
                        disabled={left === 0}
                        onChange={(e) =>
                          setLine(prescription.id, item.id, { batchNumber: e.target.value })
                        }
                        className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-teal-500 focus:outline-none disabled:opacity-40"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => onDispense(prescription)}
                  disabled={dispense.isPending}
                >
                  {dispense.isPending ? t("pharmacy:dispensing") : t("pharmacy:dispense")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLabTests } from "../../hooks/queries/useLabAndPharmacy";
import { useCreateLabOrder } from "../../hooks/mutations/useLabPharmacyMutations";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
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

interface LabTest {
  id: string;
  name: string;
  code: string;
  category: string;
  sampleType: string;
  price: { toString: () => string };
}

/**
 * The doctor's "order lab tests" dialog. Catalog grouped by category with checkboxes;
 * the charges flow to the bill on the server when the order is created.
 */
export default function LabOrderDialog({
  patientId,
  appointmentId,
  open,
  onOpenChange,
}: {
  patientId: string;
  appointmentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["lab", "common"]);
  const { data: tests, isLoading } = useLabTests();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const create = useCreateLabOrder();

  const catalogue = (Array.isArray(tests) ? tests : []) as LabTest[];
  const byCategory = catalogue.reduce<Record<string, LabTest[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const submit = () => {
    const labTestIds = [...selected];
    if (labTestIds.length === 0) {
      toast.error(t("selectTest"));
      return;
    }
    create.mutate(
      { patientId, appointmentId, labTestIds, notes: undefined },
      {
        onSuccess: () => {
          toast.success(t("orderCreated"));
          setSelected(new Set());
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" /> {t("orderLabTests")}
          </DialogTitle>
          <DialogDescription>{t("chargesFlow")}</DialogDescription>
        </DialogHeader>

        {isLoading && <Skeleton className="h-48" />}
        {!isLoading && catalogue.length === 0 && (
          <EmptyState title={t("noTestsInCatalogue")} description={t("noTestsHint")} />
        )}

        {!isLoading && catalogue.length > 0 && (
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {Object.entries(byCategory).map(([category, items]) => (
              <div key={category}>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">{category}</div>
                <div className="space-y-1">
                  {items.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            })
                          }
                        />
                        <span>
                          {t.name}
                          <span className="ml-1 text-xs text-gray-400">{t.code}</span>
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">{t.sampleType}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={create.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("common:cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending || selected.size === 0}>
            {create.isPending ? t("lab:ordering") : t("lab:orderTests", { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

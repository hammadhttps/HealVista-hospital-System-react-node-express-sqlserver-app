import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PackagePlus } from "lucide-react";
import { adjustStockSchema } from "@healvista/shared";
import { useAdjustStock } from "../../hooks/mutations/useLabPharmacyMutations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

const restockFormSchema = adjustStockSchema.omit({ medicineId: true });
type RestockForm = z.input<typeof restockFormSchema>;

/**
 * Restock dialog. A delivery (or correction) lands as an atomic increment plus a
 * ledger row carrying the new batch number — the same batch number the ledger
 * needs months later if a recall has to find who received it.
 */
export default function RestockDialog({
  medicineId,
  medicineName,
  open,
  onOpenChange,
}: {
  medicineId: string;
  medicineName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["pharmacy", "common"]);
  const restock = useAdjustStock();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RestockForm>({
    resolver: zodResolver(restockFormSchema),
    defaultValues: { changeAmount: undefined, batchNumber: "", expiryDate: "", reason: "" },
  });

  const onSubmit = (values: RestockForm) => {
    restock.mutate(
      {
        medicineId,
        changeAmount: Number(values.changeAmount),
        reason: values.reason,
        batchNumber: values.batchNumber || undefined,
        expiryDate: values.expiryDate || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("pharmacy:restocked", { medicine: medicineName }));
          reset();
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !restock.isPending && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4" />{" "}
            {t("pharmacy:restockTitle", { medicine: medicineName })}
          </DialogTitle>
          <DialogDescription>{t("pharmacy:restockDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">
              {t("pharmacy:quantityReceived")}
            </label>
            <input
              type="number"
              min={1}
              className={inputClass}
              {...register("changeAmount", { valueAsNumber: true })}
            />
            {errors.changeAmount && (
              <p className="mt-1 text-xs text-red-600">{errors.changeAmount.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                {t("pharmacy:batchNumber")}
              </label>
              <input className={inputClass} {...register("batchNumber")} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">{t("pharmacy:expiryDate")}</label>
              <input type="date" className={inputClass} {...register("expiryDate")} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">{t("pharmacy:reason")}</label>
            <input
              className={inputClass}
              placeholder={t("pharmacy:restockReasonPlaceholder")}
              {...register("reason")}
            />
            {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={restock.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("common:cancel")}
            </Button>
            <Button type="submit" disabled={restock.isPending}>
              {restock.isPending ? t("pharmacy:restocking") : t("pharmacy:restock")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

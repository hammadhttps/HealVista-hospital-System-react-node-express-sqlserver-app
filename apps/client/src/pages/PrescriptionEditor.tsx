import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useForm, useFieldArray } from "react-hook-form";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Pill, Trash2 } from "lucide-react";
import { useAppointment } from "../hooks/queries/useAppointments";
import { useMedicines } from "../hooks/queries/useLabAndPharmacy";
import { useFavouritePrescriptions } from "../hooks/queries/useClinical";
import {
  useCheckPrescriptionSafety,
  useCreatePrescription,
  useApplyFavouritePrescription,
} from "../hooks/mutations/useClinicalMutations";
import {
  PrescriptionSafetyPanel,
  warningKey,
  type SafetyWarning,
} from "../components/clinical/PrescriptionSafetyPanel";
import { prescriptionApi } from "../api/clinical";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { CardSkeleton } from "../components/primitives/Skeleton";

interface ItemRowValues {
  medicineId?: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  quantityPrescribed?: string;
  instructions?: string;
}

interface PrescriptionFormValues {
  items: ItemRowValues[];
  notes?: string;
  followUpAfterDays?: string;
}

interface SafetyReport {
  warnings: SafetyWarning[];
  blocking: SafetyWarning[];
  acknowledgeable: SafetyWarning[];
  safe: boolean;
}

interface MedicineRow {
  id: string;
  name: string;
  genericName?: string | null;
  inventory?: { quantity: number; reorderLevel: number } | null;
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

function emptyItem(): ItemRowValues {
  return { medicineId: undefined, medicineName: "", dosage: "", frequency: "", durationDays: "7" };
}

export default function PrescriptionEditor() {
  const { t } = useTranslation(["common", "prescription"]);
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { data: appointment } = useAppointment(appointmentId!);
  const { data: medicines } = useMedicines();
  const { data: favourites } = useFavouritePrescriptions();

  const safetyMutation = useCheckPrescriptionSafety();
  const createMutation = useCreatePrescription(appointment?.patient?.id as string | undefined);
  const applyFavourite = useApplyFavouritePrescription();

  const [report, setReport] = useState<SafetyReport | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [mode, setMode] = useState<"issue" | "draft">("issue");
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [createdId, setCreatedId] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PrescriptionFormValues>({
    defaultValues: { items: [emptyItem()], notes: "", followUpAfterDays: "" },
  });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" });
  const items = watch("items");

  const medicineList = Array.isArray(medicines) ? (medicines as MedicineRow[]) : [];
  const favouriteList = Array.isArray(favourites) ? favourites : [];

  const overridableUnacknowledged = report
    ? report.acknowledgeable.filter((w) => !acknowledged.has(warningKey(w)))
    : [];
  const confirmDisabled =
    Boolean(report?.blocking.length) ||
    (mode === "issue" && overridableUnacknowledged.length > 0) ||
    createMutation.isPending;

  function medicinesOf(items: ItemRowValues[]): string[] {
    return items.map((i) => i.medicineName.trim()).filter(Boolean);
  }

  function runCheck(submitMode: "issue" | "draft") {
    const current = getValues();
    const names = medicinesOf(current.items);
    if (names.length === 0) {
      toast.error(t("prescription:addMedicineFirst"));
      return;
    }
    safetyMutation.mutate(
      { appointmentId: appointmentId!, medicines: names },
      {
        onSuccess: (rep: SafetyReport) => {
          setReport(rep);
          setAcknowledged(new Set());
          setMode(submitMode);
          if (rep.safe) {
            doCreate(submitMode, new Set());
          } else {
            setSafetyOpen(true);
          }
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function doCreate(submitMode: "issue" | "draft", ack: Set<string>) {
    const current = getValues();
    const payload = {
      appointmentId: appointmentId!,
      notes: current.notes || undefined,
      isDraft: submitMode === "draft",
      followUpAfterDays: current.followUpAfterDays ? Number(current.followUpAfterDays) : undefined,
      acknowledgedWarnings: [...ack],
      items: current.items
        .filter((i) => i.medicineName.trim())
        .map((i) => ({
          medicineId: i.medicineId || undefined,
          medicineName: i.medicineName.trim(),
          dosage: i.dosage,
          frequency: i.frequency,
          durationDays: Number(i.durationDays),
          quantityPrescribed: i.quantityPrescribed ? Number(i.quantityPrescribed) : undefined,
          instructions: i.instructions || undefined,
        })),
    };
    createMutation.mutate(payload as unknown as Record<string, unknown>, {
      onSuccess: (result: { prescription: { id: string; isDraft: boolean } }) => {
        setSafetyOpen(false);
        if (result.prescription.isDraft) {
          toast.success(t("prescription:draftSaved"));
        } else {
          setCreatedId(result.prescription.id);
          toast.success(t("prescription:issued"));
        }
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function onApplyFavourite(favouriteId: string) {
    if (!favouriteId) return;
    applyFavourite.mutate(favouriteId, {
      onSuccess: (items: unknown) => {
        const rows = (items as Partial<ItemRowValues>[]).map((i) => ({
          medicineId: i.medicineId ?? undefined,
          medicineName: i.medicineName ?? "",
          dosage: i.dosage ?? "",
          frequency: i.frequency ?? "",
          durationDays: String(i.durationDays ?? 7),
          quantityPrescribed: i.quantityPrescribed ? String(i.quantityPrescribed) : undefined,
          instructions: i.instructions ?? undefined,
        }));
        if (rows.length === 0) {
          toast.error(t("prescription:favouriteEmpty"));
          return;
        }
        replace(rows);
        toast.success(t("prescription:favouriteApplied"));
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function onPickMedicine(index: number, medicine: MedicineRow | null) {
    setValue(`items.${index}.medicineId`, medicine?.id);
    if (medicine) {
      setValue(`items.${index}.medicineName`, medicine.name);
      if (!getValues(`items.${index}.quantityPrescribed`)) {
        setValue(`items.${index}.quantityPrescribed`, String(medicine.inventory?.quantity ?? ""));
      }
    }
  }

  if (!appointment) return <CardSkeleton />;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {appointment?.patient?.fullName ?? t("prescription:fallbackTitle")}
          </h1>
          {appointment?.patient?.mrn && (
            <span className="font-mono text-sm text-gray-500">{appointment.patient.mrn}</span>
          )}
          {createdId ? (
            <Badge variant="default">{t("prescription:badgeIssued")}</Badge>
          ) : (
            <Badge variant="warning">{t("prescription:badgeNew")}</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {appointment?.doctor?.fullName && (
            <span>{t("prescription:doctorName", { name: appointment.doctor.fullName })}</span>
          )}
          {appointment?.slot?.startTime && (
            <span>{new Date(appointment.slot.startTime).toLocaleString()}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Pill className="h-4 w-4" /> {t("prescription:safetyCheckHint")}
          </span>
        </div>
      </div>

      {createdId ? (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950">
          <CardContent className="p-6">
            <p className="text-emerald-900 dark:text-emerald-100">{t("prescription:issuedBody")}</p>
            <div className="mt-4 flex gap-2">
              <Button
                render={
                  <a href={prescriptionApi.pdfUrl(createdId)} target="_blank" rel="noreferrer" />
                }
              >
                <FileText className="h-4 w-4" /> {t("prescription:openPdf")}
              </Button>
              <Button variant="outline" render={<Link to="/doctor/queue" />}>
                {t("prescription:backToQueue")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit(() => {})}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> {t("prescription:items")}
                  </span>
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value=""
                    onChange={(e) => e.target.value && onApplyFavourite(e.target.value)}
                  >
                    <option value="">{t("prescription:applyFavourite")}</option>
                    {favouriteList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="space-y-3 rounded-lg border border-gray-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>{t("prescription:catalogue")}</label>
                        <select
                          className={inputCls}
                          value={items[index]?.medicineId ?? ""}
                          onChange={(e) => {
                            const m = medicineList.find((x) => x.id === e.target.value) ?? null;
                            onPickMedicine(index, m);
                          }}
                        >
                          <option value="">{t("prescription:notInCatalogue")}</option>
                          {medicineList.map((m) => (
                            <option key={m.id} value={m.id}>
                              {t("prescription:inStock", {
                                name: m.name,
                                quantity: m.inventory?.quantity ?? 0,
                              })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{t("prescription:medicineName")}</label>
                        <input
                          className={inputCls}
                          placeholder={t("prescription:medicineNamePlaceholder")}
                          {...register(`items.${index}.medicineName`)}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("prescription:dosage")}</label>
                        <input
                          className={inputCls}
                          placeholder={t("prescription:dosagePlaceholder")}
                          {...register(`items.${index}.dosage`)}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("prescription:frequency")}</label>
                        <input
                          className={inputCls}
                          placeholder={t("prescription:frequencyPlaceholder")}
                          {...register(`items.${index}.frequency`)}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("prescription:durationDays")}</label>
                        <input
                          className={inputCls}
                          type="number"
                          min={1}
                          {...register(`items.${index}.durationDays`)}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("prescription:quantityPrescribed")}</label>
                        <input
                          className={inputCls}
                          type="number"
                          min={1}
                          placeholder={t("prescription:optional")}
                          {...register(`items.${index}.quantityPrescribed`)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>{t("prescription:instructions")}</label>
                      <input
                        className={inputCls}
                        placeholder={t("prescription:instructionsPlaceholder")}
                        {...register(`items.${index}.instructions`)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" /> {t("prescription:remove")}
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(emptyItem())}
                >
                  <Plus className="h-4 w-4" /> {t("prescription:addItem")}
                </Button>
                {errors.items?.message && (
                  <p className="text-sm text-red-600">{errors.items.message}</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("prescription:planDetails")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <label className={labelCls}>{t("prescription:notes")}</label>
                    <textarea
                      className={inputCls}
                      rows={3}
                      placeholder={t("prescription:notesPlaceholder")}
                      {...register("notes")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelCls}>{t("prescription:followUpAfterDays")}</label>
                    <input
                      className={inputCls}
                      type="number"
                      min={1}
                      max={365}
                      placeholder={t("prescription:followUpPlaceholder")}
                      {...register("followUpAfterDays")}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("common:actions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={safetyMutation.isPending || createMutation.isPending}
                    onClick={() => runCheck("issue")}
                  >
                    {safetyMutation.isPending
                      ? t("prescription:checkingSafety")
                      : t("prescription:reviewIssue")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={safetyMutation.isPending || createMutation.isPending}
                    onClick={() => runCheck("draft")}
                  >
                    {t("prescription:saveAsDraft")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      )}

      <Dialog
        open={safetyOpen}
        onOpenChange={(o) => !o && !createMutation.isPending && setSafetyOpen(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {report?.blocking.length
                ? t("prescription:blockedTitle")
                : t("prescription:safetyReviewTitle")}
            </DialogTitle>
            <DialogDescription>
              {report?.blocking.length
                ? t("prescription:blockedBody")
                : mode === "draft"
                  ? t("prescription:acknowledgeWarningsDraft")
                  : t("prescription:acknowledgeWarningsIssue")}
            </DialogDescription>
          </DialogHeader>
          {report && (
            <PrescriptionSafetyPanel
              warnings={report.warnings}
              acknowledged={acknowledged}
              onToggleAcknowledge={(key) =>
                setAcknowledged((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => setSafetyOpen(false)}
            >
              {t("common:cancel")}
            </Button>
            <Button disabled={confirmDisabled} onClick={() => doCreate(mode, acknowledged)}>
              {createMutation.isPending
                ? t("common:saving")
                : mode === "issue"
                  ? t("prescription:issue")
                  : t("prescription:saveDraft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

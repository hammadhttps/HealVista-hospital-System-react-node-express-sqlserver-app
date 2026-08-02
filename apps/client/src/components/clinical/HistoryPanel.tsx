import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  allergyInputSchema,
  conditionInputSchema,
  vaccinationInputSchema,
  surgeryInputSchema,
  familyHistoryInputSchema,
  lifestyleInputSchema,
  type AllergyInput,
  type ConditionInput,
  type VaccinationInput,
  type SurgeryInput,
  type FamilyHistoryInput,
  type LifestyleInput,
} from "@healvista/shared";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../primitives/EmptyState";
import {
  usePatientHistory,
  useAllergies,
  useConditions,
  useVaccinations,
  useSurgeries,
  useFamilyHistory,
  useLifestyle,
} from "../../hooks/queries/useClinical";
import {
  useAddAllergy,
  useConfirmAllergy,
  useRemoveAllergy,
  useAddCondition,
  useResolveCondition,
  useRemoveCondition,
  useAddVaccination,
  useUpdateVaccination,
  useRemoveVaccination,
  useAddSurgery,
  useUpdateSurgery,
  useRemoveSurgery,
  useAddFamilyHistory,
  useUpdateFamilyHistory,
  useRemoveFamilyHistory,
  useUpsertLifestyle,
} from "../../hooks/mutations/useClinicalMutations";
import { useAuthStore } from "../../store/authStore";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

// Query hooks resolve through an `any` axios envelope, so shape the rows here.
interface AllergyRow {
  id: string;
  allergen: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
  reaction?: string | null;
  confirmedAt?: string | null;
}
interface ConditionRow {
  id: string;
  condition: string;
  diagnosedAt?: string | null;
  isActive: boolean;
}
interface VaccinationRow {
  id: string;
  vaccineName: string;
  doseNumber?: number | null;
  administeredAt: string;
  batchNumber?: string | null;
  nextDueAt?: string | null;
}
interface SurgeryRow {
  id: string;
  procedure: string;
  performedAt?: string | null;
  hospital?: string | null;
}
interface FamilyRow {
  id: string;
  relationship: string;
  condition: string;
  notes?: string | null;
}

/** Who may write history data. The server enforces this too; this only hides the forms. */
function useCanWrite() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "DOCTOR" || role === "ADMIN" || role === "PATIENT";
}

function Field({
  label,
  type = "text",
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} className={inputCls} {...props} />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}

function Section({
  title,
  badge,
  children,
  addForm,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  addForm?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {badge}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {addForm}
      </CardContent>
    </Card>
  );
}

// ─── Allergies ──────────────────────────────────────────────────────────────

function AllergyForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const mutation = useAddAllergy(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AllergyInput>({ resolver: zodResolver(allergyInputSchema) });

  if (!canWrite) return null;

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-3"
      onSubmit={handleSubmit((data) => {
        mutation.mutate(data, {
          onSuccess: () => {
            toast.success(t("clinical:allergyRecorded"));
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label={t("clinical:allergen")}
        placeholder={t("clinical:allergenPlaceholder")}
        error={errors.allergen?.message}
        {...register("allergen")}
      />
      <div>
        <label className={labelCls}>{t("clinical:severity")}</label>
        <select className={inputCls} {...register("severity")}>
          <option value="MILD">{t("clinical:severityMild")}</option>
          <option value="MODERATE">{t("clinical:severityModerate")}</option>
          <option value="SEVERE">{t("clinical:severitySevere")}</option>
        </select>
      </div>
      <Field
        label={t("clinical:reaction")}
        placeholder={t("clinical:reactionPlaceholder")}
        error={errors.reaction?.message}
        {...register("reaction")}
      />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:saving") : t("clinical:addAllergy")}
        </Button>
      </div>
    </form>
  );
}

function AllergiesSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data, isLoading } = useAllergies(patientId);
  const confirm = useConfirmAllergy(patientId);
  const remove = useRemoveAllergy(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as AllergyRow[];

  return (
    <Section
      title={t("clinical:allergies")}
      addForm={<AllergyForm patientId={patientId} />}
      badge={<Badge variant="warning">{isLoading ? "…" : list.length}</Badge>}
    >
      {list.length === 0 ? (
        <EmptyState title={t("clinical:noAllergies")} />
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{a.allergen}</span>
                <Badge
                  className="ml-2 text-xs"
                  variant={
                    a.severity === "SEVERE"
                      ? "destructive"
                      : a.severity === "MODERATE"
                        ? "warning"
                        : "outline"
                  }
                >
                  {a.severity === "MILD"
                    ? t("clinical:severityMild")
                    : a.severity === "MODERATE"
                      ? t("clinical:severityModerate")
                      : t("clinical:severitySevere")}
                </Badge>
                {a.reaction && <span className="ml-2 text-sm text-gray-600">{a.reaction}</span>}
                {!a.confirmedAt && (
                  <span className="ml-2 text-xs text-amber-600">{t("clinical:unconfirmed")}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canWrite && !a.confirmedAt && (
                  <Button size="sm" variant="outline" onClick={() => confirm.mutate(a.id)}>
                    {t("clinical:confirm")}
                  </Button>
                )}
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => remove.mutate(a.id)}
                  >
                    {t("clinical:remove")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Conditions ─────────────────────────────────────────────────────────────

function ConditionForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const mutation = useAddCondition(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConditionInput>({ resolver: zodResolver(conditionInputSchema) });

  if (!canWrite) return null;

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-3"
      onSubmit={handleSubmit((data) => {
        mutation.mutate(data, {
          onSuccess: () => {
            toast.success(t("clinical:conditionRecorded"));
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label={t("clinical:condition")}
        placeholder={t("clinical:conditionPlaceholder")}
        error={errors.condition?.message}
        {...register("condition")}
      />
      <Field
        label={t("clinical:diagnosedDate")}
        type="date"
        error={errors.diagnosedAt?.message}
        {...register("diagnosedAt")}
      />
      <Field label={t("clinical:notes")} error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:saving") : t("clinical:addCondition")}
        </Button>
      </div>
    </form>
  );
}

function ConditionsSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data, isLoading } = useConditions(patientId);
  const resolve = useResolveCondition(patientId);
  const remove = useRemoveCondition(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as ConditionRow[];

  return (
    <Section
      title={t("clinical:conditions")}
      addForm={<ConditionForm patientId={patientId} />}
      badge={
        <Badge variant="outline">
          {isLoading
            ? "…"
            : t("clinical:activeCount", { count: list.filter((c) => c.isActive).length })}
        </Badge>
      }
    >
      {list.length === 0 ? (
        <EmptyState title={t("clinical:noConditions")} />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{c.condition}</span>
                {c.diagnosedAt && (
                  <span className="ml-2 text-sm text-gray-600">
                    {t("clinical:since", {
                      date: new Date(c.diagnosedAt).toLocaleDateString(),
                    })}
                  </span>
                )}
                {!c.isActive && (
                  <Badge className="ml-2 text-xs" variant="outline">
                    {t("clinical:resolved")}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canWrite && c.isActive && (
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate(c.id)}>
                    {t("clinical:resolve")}
                  </Button>
                )}
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => remove.mutate(c.id)}
                  >
                    {t("clinical:remove")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Vaccinations ───────────────────────────────────────────────────────────

function VaccinationForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const mutation = useAddVaccination(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof vaccinationInputSchema>>({
    resolver: zodResolver(vaccinationInputSchema),
  });

  if (!canWrite) return null;

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-4"
      onSubmit={handleSubmit((data) => {
        mutation.mutate(data, {
          onSuccess: () => {
            toast.success(t("clinical:vaccinationRecorded"));
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label={t("clinical:vaccine")}
        placeholder={t("clinical:vaccinePlaceholder")}
        error={errors.vaccineName?.message}
        {...register("vaccineName")}
      />
      <Field
        label={t("clinical:doseNumber")}
        type="number"
        error={errors.doseNumber?.message}
        {...register("doseNumber")}
      />
      <Field
        label={t("clinical:date")}
        type="date"
        error={errors.administeredAt?.message}
        {...register("administeredAt")}
      />
      <Field
        label={t("clinical:batchNumber")}
        error={errors.batchNumber?.message}
        {...register("batchNumber")}
      />
      <Field
        label={t("clinical:administeredBy")}
        error={errors.administeredBy?.message}
        {...register("administeredBy")}
      />
      <Field
        label={t("clinical:nextDue")}
        type="date"
        error={errors.nextDueAt?.message}
        {...register("nextDueAt")}
      />
      <div className="sm:col-span-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:saving") : t("clinical:addVaccination")}
        </Button>
      </div>
    </form>
  );
}

function VaccinationsSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data, isLoading } = useVaccinations(patientId);
  const remove = useRemoveVaccination(patientId);
  const canWrite = useCanWrite();
  const today = new Date();
  const list = (data ?? []) as VaccinationRow[];

  return (
    <Section title={t("clinical:vaccinations")} addForm={<VaccinationForm patientId={patientId} />}>
      {isLoading ? (
        <EmptyState title={t("common:loading")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("clinical:noVaccinations")} />
      ) : (
        <div className="space-y-2">
          {list.map((v) => {
            const due = v.nextDueAt ? new Date(v.nextDueAt) : null;
            const overdue = due && due < today;
            return (
              <li
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{v.vaccineName}</span>
                  {v.doseNumber && (
                    <span className="ml-1 text-sm text-gray-600">
                      {t("clinical:dose", { n: v.doseNumber })}
                    </span>
                  )}
                  <span className="ml-2 text-sm text-gray-600">
                    {new Date(v.administeredAt).toLocaleDateString()}
                  </span>
                  {v.batchNumber && (
                    <span className="ml-2 font-mono text-xs text-gray-500">
                      {t("clinical:batch", { n: v.batchNumber })}
                    </span>
                  )}
                  {due &&
                    (overdue ? (
                      <Badge className="ml-2 text-xs" variant="destructive">
                        {t("clinical:due", { date: due.toLocaleDateString() })}
                      </Badge>
                    ) : (
                      <Badge className="ml-2 text-xs" variant="outline">
                        {t("clinical:next", { date: due.toLocaleDateString() })}
                      </Badge>
                    ))}
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => remove.mutate(v.id)}
                  >
                    {t("clinical:remove")}
                  </Button>
                )}
              </li>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ─── Surgeries ──────────────────────────────────────────────────────────────

function SurgeryForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const mutation = useAddSurgery(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SurgeryInput>({ resolver: zodResolver(surgeryInputSchema) });

  if (!canWrite) return null;

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-3"
      onSubmit={handleSubmit((data) => {
        mutation.mutate(data, {
          onSuccess: () => {
            toast.success(t("clinical:surgeryRecorded"));
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label={t("clinical:procedure")}
        error={errors.procedure?.message}
        {...register("procedure")}
      />
      <Field
        label={t("clinical:date")}
        type="date"
        error={errors.performedAt?.message}
        {...register("performedAt")}
      />
      <Field
        label={t("clinical:hospital")}
        error={errors.hospital?.message}
        {...register("hospital")}
      />
      <Field
        label={t("clinical:surgeon")}
        error={errors.surgeon?.message}
        {...register("surgeon")}
      />
      <Field label={t("clinical:notes")} error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:saving") : t("clinical:addSurgery")}
        </Button>
      </div>
    </form>
  );
}

function SurgeriesSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data, isLoading } = useSurgeries(patientId);
  const remove = useRemoveSurgery(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as SurgeryRow[];

  return (
    <Section title={t("clinical:surgicalHistory")} addForm={<SurgeryForm patientId={patientId} />}>
      {isLoading ? (
        <EmptyState title={t("common:loading")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("clinical:noSurgeries")} />
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{s.procedure}</span>
                {s.performedAt && (
                  <span className="ml-2 text-sm text-gray-600">
                    {new Date(s.performedAt).toLocaleDateString()}
                  </span>
                )}
                {s.hospital && <span className="ml-2 text-sm text-gray-500">{s.hospital}</span>}
              </div>
              {canWrite && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => remove.mutate(s.id)}
                >
                  {t("clinical:remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Family history ─────────────────────────────────────────────────────────

function FamilyHistoryForm({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const mutation = useAddFamilyHistory(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FamilyHistoryInput>({ resolver: zodResolver(familyHistoryInputSchema) });

  if (!canWrite) return null;

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-dashed border-gray-300 p-3 sm:grid-cols-3"
      onSubmit={handleSubmit((data) => {
        mutation.mutate(data, {
          onSuccess: () => {
            toast.success(t("clinical:familyHistoryRecorded"));
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label={t("clinical:relationship")}
        placeholder={t("clinical:relationshipPlaceholder")}
        error={errors.relationship?.message}
        {...register("relationship")}
      />
      <Field
        label={t("clinical:condition")}
        error={errors.condition?.message}
        {...register("condition")}
      />
      <Field label={t("clinical:notes")} error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t("common:saving") : t("clinical:addEntry")}
        </Button>
      </div>
    </form>
  );
}

function FamilyHistorySection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data, isLoading } = useFamilyHistory(patientId);
  const remove = useRemoveFamilyHistory(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as FamilyRow[];

  return (
    <Section
      title={t("clinical:familyHistory")}
      addForm={<FamilyHistoryForm patientId={patientId} />}
    >
      {isLoading ? (
        <EmptyState title={t("common:loading")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("clinical:noFamilyHistory")} />
      ) : (
        <ul className="space-y-2">
          {list.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{f.relationship}</span>
                <span className="ml-2 text-sm text-gray-600">{f.condition}</span>
                {f.notes && <span className="ml-2 text-sm text-gray-500">{f.notes}</span>}
              </div>
              {canWrite && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => remove.mutate(f.id)}
                >
                  {t("clinical:remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Lifestyle ──────────────────────────────────────────────────────────────

function LifestyleSection({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data } = useLifestyle(patientId);
  const mutation = useUpsertLifestyle(patientId);
  const canWrite = useCanWrite();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LifestyleInput>({
    resolver: zodResolver(lifestyleInputSchema),
    defaultValues: {
      smokingStatus: data?.smokingStatus ?? "",
      alcoholUse: data?.alcoholUse ?? "",
      exerciseFreq: data?.exerciseFreq ?? "",
      dietNotes: data?.dietNotes ?? "",
    },
  });

  return (
    <Section title={t("clinical:lifestyle")}>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values, {
            onSuccess: () => toast.success(t("clinical:lifestyleUpdated")),
            onError: (e) => toast.error(e.message),
          });
        })}
      >
        <Field
          label={t("clinical:smoking")}
          error={errors.smokingStatus?.message}
          {...register("smokingStatus")}
        />
        <Field
          label={t("clinical:alcoholUse")}
          error={errors.alcoholUse?.message}
          {...register("alcoholUse")}
        />
        <Field
          label={t("clinical:exerciseFrequency")}
          error={errors.exerciseFreq?.message}
          {...register("exerciseFreq")}
        />
        <Field
          label={t("clinical:dietNotes")}
          error={errors.dietNotes?.message}
          {...register("dietNotes")}
        />
        {canWrite && (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("common:saving") : t("clinical:saveLifestyle")}
            </Button>
          </div>
        )}
      </form>
    </Section>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export default function HistoryPanel({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["clinical", "common"]);
  const { data: summary } = usePatientHistory(patientId);

  return (
    <div className="space-y-4">
      {summary && summary.severeAllergies && summary.severeAllergies.length > 0 && (
        <div className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {summary.severeAllergies.length === 1
            ? t("clinical:severeAllergyOne", { count: summary.severeAllergies.length })
            : t("clinical:severeAllergyMany", { count: summary.severeAllergies.length })}
        </div>
      )}
      <AllergiesSection patientId={patientId} />
      <ConditionsSection patientId={patientId} />
      <VaccinationsSection patientId={patientId} />
      <SurgeriesSection patientId={patientId} />
      <FamilyHistorySection patientId={patientId} />
      <LifestyleSection patientId={patientId} />
    </div>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
            toast.success("Allergy recorded");
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label="Allergen"
        placeholder="e.g. Penicillin"
        error={errors.allergen?.message}
        {...register("allergen")}
      />
      <div>
        <label className={labelCls}>Severity</label>
        <select className={inputCls} {...register("severity")}>
          <option value="MILD">Mild</option>
          <option value="MODERATE">Moderate</option>
          <option value="SEVERE">Severe</option>
        </select>
      </div>
      <Field
        label="Reaction"
        placeholder="e.g. rash, anaphylaxis"
        error={errors.reaction?.message}
        {...register("reaction")}
      />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add Allergy"}
        </Button>
      </div>
    </form>
  );
}

function AllergiesSection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useAllergies(patientId);
  const confirm = useConfirmAllergy(patientId);
  const remove = useRemoveAllergy(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as AllergyRow[];

  return (
    <Section
      title="Allergies"
      addForm={<AllergyForm patientId={patientId} />}
      badge={<Badge variant="warning">{isLoading ? "…" : list.length}</Badge>}
    >
      {list.length === 0 ? (
        <EmptyState title="No allergies recorded" />
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
                  {a.severity}
                </Badge>
                {a.reaction && <span className="ml-2 text-sm text-gray-600">{a.reaction}</span>}
                {!a.confirmedAt && <span className="ml-2 text-xs text-amber-600">unconfirmed</span>}
              </div>
              <div className="flex items-center gap-1">
                {canWrite && !a.confirmedAt && (
                  <Button size="sm" variant="outline" onClick={() => confirm.mutate(a.id)}>
                    Confirm
                  </Button>
                )}
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => remove.mutate(a.id)}
                  >
                    Remove
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
            toast.success("Condition recorded");
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label="Condition"
        placeholder="e.g. Hypertension"
        error={errors.condition?.message}
        {...register("condition")}
      />
      <Field
        label="Diagnosed date"
        type="date"
        error={errors.diagnosedAt?.message}
        {...register("diagnosedAt")}
      />
      <Field label="Notes" error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add Condition"}
        </Button>
      </div>
    </form>
  );
}

function ConditionsSection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useConditions(patientId);
  const resolve = useResolveCondition(patientId);
  const remove = useRemoveCondition(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as ConditionRow[];

  return (
    <Section
      title="Conditions"
      addForm={<ConditionForm patientId={patientId} />}
      badge={
        <Badge variant="outline">
          {isLoading ? "…" : list.filter((c) => c.isActive).length} active
        </Badge>
      }
    >
      {list.length === 0 ? (
        <EmptyState title="No conditions recorded" />
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
                    since {new Date(c.diagnosedAt).toLocaleDateString()}
                  </span>
                )}
                {!c.isActive && (
                  <Badge className="ml-2 text-xs" variant="outline">
                    resolved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canWrite && c.isActive && (
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate(c.id)}>
                    Resolve
                  </Button>
                )}
                {canWrite && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => remove.mutate(c.id)}
                  >
                    Remove
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
            toast.success("Vaccination recorded");
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label="Vaccine"
        placeholder="e.g. Influenza"
        error={errors.vaccineName?.message}
        {...register("vaccineName")}
      />
      <Field
        label="Dose #"
        type="number"
        error={errors.doseNumber?.message}
        {...register("doseNumber")}
      />
      <Field
        label="Date"
        type="date"
        error={errors.administeredAt?.message}
        {...register("administeredAt")}
      />
      <Field label="Batch no." error={errors.batchNumber?.message} {...register("batchNumber")} />
      <Field
        label="Administered by"
        error={errors.administeredBy?.message}
        {...register("administeredBy")}
      />
      <Field
        label="Next due"
        type="date"
        error={errors.nextDueAt?.message}
        {...register("nextDueAt")}
      />
      <div className="sm:col-span-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add Vaccination"}
        </Button>
      </div>
    </form>
  );
}

function VaccinationsSection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useVaccinations(patientId);
  const remove = useRemoveVaccination(patientId);
  const canWrite = useCanWrite();
  const today = new Date();
  const list = (data ?? []) as VaccinationRow[];

  return (
    <Section title="Vaccinations" addForm={<VaccinationForm patientId={patientId} />}>
      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : list.length === 0 ? (
        <EmptyState title="No vaccinations recorded" />
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
                    <span className="ml-1 text-sm text-gray-600">(dose {v.doseNumber})</span>
                  )}
                  <span className="ml-2 text-sm text-gray-600">
                    {new Date(v.administeredAt).toLocaleDateString()}
                  </span>
                  {v.batchNumber && (
                    <span className="ml-2 font-mono text-xs text-gray-500">
                      batch {v.batchNumber}
                    </span>
                  )}
                  {due &&
                    (overdue ? (
                      <Badge className="ml-2 text-xs" variant="destructive">
                        due {due.toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge className="ml-2 text-xs" variant="outline">
                        next {due.toLocaleDateString()}
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
                    Remove
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
            toast.success("Surgery recorded");
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field label="Procedure" error={errors.procedure?.message} {...register("procedure")} />
      <Field
        label="Date"
        type="date"
        error={errors.performedAt?.message}
        {...register("performedAt")}
      />
      <Field label="Hospital" error={errors.hospital?.message} {...register("hospital")} />
      <Field label="Surgeon" error={errors.surgeon?.message} {...register("surgeon")} />
      <Field label="Notes" error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add Surgery"}
        </Button>
      </div>
    </form>
  );
}

function SurgeriesSection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useSurgeries(patientId);
  const remove = useRemoveSurgery(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as SurgeryRow[];

  return (
    <Section title="Surgical history" addForm={<SurgeryForm patientId={patientId} />}>
      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : list.length === 0 ? (
        <EmptyState title="No surgeries recorded" />
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
                  Remove
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
            toast.success("Family history recorded");
            reset();
          },
          onError: (e) => toast.error(e.message),
        });
      })}
    >
      <Field
        label="Relationship"
        placeholder="e.g. Father"
        error={errors.relationship?.message}
        {...register("relationship")}
      />
      <Field label="Condition" error={errors.condition?.message} {...register("condition")} />
      <Field label="Notes" error={errors.notes?.message} {...register("notes")} />
      <div className="sm:col-span-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add Entry"}
        </Button>
      </div>
    </form>
  );
}

function FamilyHistorySection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useFamilyHistory(patientId);
  const remove = useRemoveFamilyHistory(patientId);
  const canWrite = useCanWrite();
  const list = (data ?? []) as FamilyRow[];

  return (
    <Section title="Family history" addForm={<FamilyHistoryForm patientId={patientId} />}>
      {isLoading ? (
        <EmptyState title="Loading…" />
      ) : list.length === 0 ? (
        <EmptyState title="No family history recorded" />
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
                  Remove
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
    <Section title="Lifestyle">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values, {
            onSuccess: () => toast.success("Lifestyle profile updated"),
            onError: (e) => toast.error(e.message),
          });
        })}
      >
        <Field
          label="Smoking"
          error={errors.smokingStatus?.message}
          {...register("smokingStatus")}
        />
        <Field label="Alcohol use" error={errors.alcoholUse?.message} {...register("alcoholUse")} />
        <Field
          label="Exercise frequency"
          error={errors.exerciseFreq?.message}
          {...register("exerciseFreq")}
        />
        <Field label="Diet notes" error={errors.dietNotes?.message} {...register("dietNotes")} />
        {canWrite && (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save Lifestyle"}
            </Button>
          </div>
        )}
      </form>
    </Section>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export default function HistoryPanel({ patientId }: { patientId: string }) {
  const { data: summary } = usePatientHistory(patientId);

  return (
    <div className="space-y-4">
      {summary && summary.severeAllergies && summary.severeAllergies.length > 0 && (
        <div className="rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          ⚠ {summary.severeAllergies.length} severe allerg
          {summary.severeAllergies.length === 1 ? "y" : "ies"} — see allergy banner
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

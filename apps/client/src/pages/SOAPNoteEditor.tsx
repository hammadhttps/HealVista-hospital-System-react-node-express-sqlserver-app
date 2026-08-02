import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2, Lock, ScrollText, Sparkles, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppointment } from "../hooks/queries/useAppointments";
import {
  useConsultationNote,
  usePreviousNote,
  useNoteTemplates,
  useLatestVitals,
} from "../hooks/queries/useClinical";
import { useSaveNote, useSignNote, useAddAddendum } from "../hooks/mutations/useClinicalMutations";
import { useGenerateSoapDraft } from "../hooks/mutations/useAiMutations";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/primitives/EmptyState";
import { CardSkeleton } from "../components/primitives/Skeleton";
import AIDisclaimer from "../components/ai/AIDisclaimer";
import { LatestVitalsCard } from "../components/clinical/VitalsPanel";
import { useParams } from "react-router-dom";

interface NoteFormValues {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosisCodes: string;
}

interface NoteRow {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosisCodes?: string[];
  signedAt?: string | null;
  locked?: boolean;
  addenda?: { id: string; content: string; createdAt: string }[];
}

interface NoteTemplateRow {
  id: string;
  name: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

const labelCls = "block text-sm font-medium text-gray-700 mb-1";
const textareaCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none min-h-24";

const SOAP_FIELDS: {
  key: "subjective" | "objective" | "assessment" | "plan";
  labelKey: string;
  hintKey: string;
}[] = [
  { key: "subjective", labelKey: "soap:soapSubjective", hintKey: "soap:soapSubjectiveHint" },
  { key: "objective", labelKey: "soap:soapObjective", hintKey: "soap:soapObjectiveHint" },
  { key: "assessment", labelKey: "soap:soapAssessment", hintKey: "soap:soapAssessmentHint" },
  { key: "plan", labelKey: "soap:soapPlan", hintKey: "soap:soapPlanHint" },
];

export default function SOAPNoteEditor() {
  const { t } = useTranslation(["soap", "common"]);
  const { appointmentId } = useParams<{ appointmentId: string }>();

  const { data: appointment } = useAppointment(appointmentId!);
  const { data: note, isLoading: noteLoading } = useConsultationNote(appointmentId!);
  const { data: previousNote } = usePreviousNote(appointmentId!);
  const { data: templates } = useNoteTemplates();

  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  /** The AI-generated draft currently loaded, or null. `aiAssisted` is recorded on save. */
  const [aiDraft, setAiDraft] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  } | null>(null);

  const {
    register,
    watch,
    reset,
    setValue,
    handleSubmit,
    formState: { isDirty },
  } = useForm<NoteFormValues>({
    defaultValues: {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      diagnosisCodes: "",
    },
  });

  const values = watch();

  // Hydrate the form from the loaded note. Signed notes beyond the lock window are
  // read-only — the form is disabled and an addendum form appears instead.
  useEffect(() => {
    if (note) {
      reset({
        subjective: note.subjective ?? "",
        objective: note.objective ?? "",
        assessment: note.assessment ?? "",
        plan: note.plan ?? "",
        diagnosisCodes: (note.diagnosisCodes ?? []).join(", "),
      });
    }
  }, [note, reset]);

  const saveMutation = useSaveNote(appointmentId!);
  const signMutation = useSignNote(appointmentId!);
  const addendumMutation = useAddAddendum(appointmentId!);
  const draftMutation = useGenerateSoapDraft(appointmentId!);

  const locked = Boolean(note?.locked);
  const signed = Boolean(note?.signedAt);
  const noteRow = (note ?? null) as NoteRow | null;

  /** True while a section still holds its AI text untouched — the diff highlight. */
  function isAiUneditedSection(key: "subjective" | "objective" | "assessment" | "plan"): boolean {
    return aiDraft !== null && values[key] === aiDraft[key];
  }

  /** True when every SOAP section is byte-identical to the AI draft. */
  function isUneditedAiDraft(): boolean {
    if (!aiDraft) return false;
    return (
      values.subjective === aiDraft.subjective &&
      values.objective === aiDraft.objective &&
      values.assessment === aiDraft.assessment &&
      values.plan === aiDraft.plan
    );
  }

  // Autosave on idle. A debounce timer is an allowed useEffect use (not data
  // fetching); the note stays a draft until signed and the server audits only the
  // first write. Skipped while the form is pristine so a fresh load never rewrites
  // the same note, and skipped while an unedited AI draft is loaded — the server
  // rejects byte-identical drafts, and a rejected autosave toast would fire on
  // every keystroke of nothing.
  useEffect(() => {
    if (locked || !isDirty || isUneditedAiDraft()) return;
    const handler = setTimeout(() => {
      setAutosaveState("saving");
      saveMutation.mutate(
        {
          subjective: values.subjective,
          objective: values.objective,
          assessment: values.assessment,
          plan: values.plan,
          diagnosisCodes: values.diagnosisCodes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          aiAssisted: aiDraft !== null,
        },
        {
          onSuccess: () => setAutosaveState("saved"),
          onError: () => {
            setAutosaveState("idle");
            toast.error(t("soap:autosaveFailed"));
          },
        },
      );
    }, 1200);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, locked, isDirty, aiDraft]);

  const templateList = useMemo(() => (templates ?? []) as NoteTemplateRow[], [templates]);

  function applyTemplate(templateId: string) {
    const tmpl = templateList.find((x) => x.id === templateId);
    if (!tmpl) return;
    if (tmpl.subjective) setValue("subjective", tmpl.subjective);
    if (tmpl.objective) setValue("objective", tmpl.objective);
    if (tmpl.assessment) setValue("assessment", tmpl.assessment);
    if (tmpl.plan) setValue("plan", tmpl.plan);
    toast.success(t("soap:templateApplied", { name: tmpl.name }));
  }

  function onDraftWithAi() {
    draftMutation.mutate(undefined, {
      onSuccess: (result) => {
        setValue("subjective", result.draft.subjective);
        setValue("objective", result.draft.objective);
        setValue("assessment", result.draft.assessment);
        setValue("plan", result.draft.plan);
        setAiDraft(result.draft);
        toast.success(result.fallback ? t("soap:draftAppliedFallback") : t("soap:draftApplied"));
      },
    });
  }

  /** One-click discard — back to the last saved note (or a blank draft). */
  function discardAiDraft() {
    setAiDraft(null);
    reset({
      subjective: note?.subjective ?? "",
      objective: note?.objective ?? "",
      assessment: note?.assessment ?? "",
      plan: note?.plan ?? "",
      diagnosisCodes: (note?.diagnosisCodes ?? []).join(", "),
    });
    toast.info(t("soap:draftDiscarded"));
  }

  function onSign() {
    const { assessment, plan } = values;
    if (isUneditedAiDraft()) {
      toast.error(t("soap:signEditDraftRequired"));
      return;
    }
    if (!assessment.trim() || !plan.trim()) {
      toast.error(t("soap:signRequiresAssessmentPlan"));
      return;
    }
    signMutation.mutate(undefined, {
      onSuccess: () => toast.success(t("soap:noteSigned")),
      onError: (e) => toast.error(e.message),
    });
  }

  function onAddendum(content: string) {
    if (!content.trim()) {
      toast.error(t("soap:addendumNeedsContent"));
      return;
    }
    addendumMutation.mutate(content, {
      onSuccess: () => toast.success(t("soap:addendumAdded")),
      onError: (e) => toast.error(e.message),
    });
  }

  if (noteLoading) return <CardSkeleton />;

  const patientId = appointment?.patient?.id as string | undefined;
  const prevNote = previousNote as (NoteRow & { appointment?: unknown }) | undefined;

  return (
    <div className="space-y-4">
      {/* Appointment header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {appointment?.patient?.fullName ?? t("soap:consultationFallback")}
          </h1>
          {appointment?.patient?.mrn && (
            <span className="font-mono text-sm text-gray-500">{appointment.patient.mrn}</span>
          )}
          {signed ? (
            <Badge variant="default">{t("soap:signed")}</Badge>
          ) : (
            <Badge variant="warning">{t("soap:draft")}</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {appointment?.doctor?.fullName && <span>Dr. {appointment.doctor.fullName}</span>}
          {appointment?.slot?.startTime && (
            <span>{new Date(appointment.slot.startTime).toLocaleString()}</span>
          )}
          <span className="flex items-center gap-1">
            {autosaveState === "saving" && (
              <span className="text-gray-400">{t("soap:saving")}</span>
            )}
            {autosaveState === "saved" && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> {t("soap:saved")}
              </span>
            )}
          </span>
        </div>
      </div>

      {!note && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {t("soap:noNoteYet")}
        </div>
      )}

      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
          <Lock className="h-4 w-4" /> {t("soap:lockedHint")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* SOAP editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> {t("soap:title")}
              </span>
              <span className="flex items-center gap-2">
                {aiDraft && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={discardAiDraft}
                    disabled={locked}
                    title={t("soap:discardTitle")}
                  >
                    <Undo2 className="h-3.5 w-3.5" /> {t("soap:discard")}
                  </Button>
                )}
                {templateList.length > 0 && (
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value=""
                    onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                  >
                    <option value="">{t("soap:applyTemplate")}</option>
                    {templateList.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDraftWithAi}
                  disabled={locked || draftMutation.isPending}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {draftMutation.isPending ? t("soap:drafting") : t("soap:draftWithAi")}
                </Button>
              </span>
            </CardTitle>
            {aiDraft && <p className="text-xs text-blue-700">{t("soap:aiDraftAppliedHint")}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            <form id="soap-form" onSubmit={handleSubmit(() => {})}>
              {SOAP_FIELDS.map((f) => {
                const aiUnedited = isAiUneditedSection(f.key);
                return (
                  <div key={f.key} className="space-y-1">
                    <label className={labelCls}>
                      {t(f.labelKey)}{" "}
                      <span className="text-xs font-normal text-gray-400">— {t(f.hintKey)}</span>
                      {aiUnedited && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          <Sparkles className="h-3 w-3" /> {t("soap:aiBadge")}
                        </span>
                      )}
                    </label>
                    <textarea
                      className={`${textareaCls} ${
                        aiUnedited ? "border-blue-300 bg-blue-50/60 focus:border-blue-500" : ""
                      }`}
                      disabled={locked}
                      placeholder={t(f.labelKey)}
                      {...register(f.key)}
                    />
                  </div>
                );
              })}
              <div className="space-y-1">
                <label className={labelCls}>{t("soap:diagnosisCodes")}</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  disabled={locked}
                  placeholder={t("soap:diagnosisCodesPlaceholder")}
                  {...register("diagnosisCodes")}
                />
              </div>
            </form>

            {draftMutation.isPending && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                {t("soap:draftingNotice")}
              </div>
            )}

            {!locked && <AIDisclaimer />}

            {!locked && (
              <div className="flex items-center justify-between">
                <Button form="soap-form" type="submit" disabled={saveMutation.isPending}>
                  {t("soap:saveDraft")}
                </Button>
                <Button onClick={onSign} disabled={signMutation.isPending}>
                  {signMutation.isPending ? t("soap:signing") : t("soap:signNote")}
                </Button>
              </div>
            )}

            {noteRow && noteRow.addenda && noteRow.addenda.length > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-700">{t("soap:addenda")}</p>
                {noteRow.addenda.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div className="text-xs text-gray-400">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                    <p className="mt-1">{a.content}</p>
                  </div>
                ))}
              </div>
            )}

            {locked && <AddendumForm onSubmit={onAddendum} pending={addendumMutation.isPending} />}
          </CardContent>
        </Card>

        {/* Comparison panel */}
        <div className="space-y-4">
          {patientId && <LatestVitalsCard patientId={patientId} />}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("soap:previousVisit")}</CardTitle>
            </CardHeader>
            <CardContent>
              {!prevNote ? (
                <EmptyState title={t("soap:noPreviousNote")} />
              ) : (
                <div className="space-y-3 text-sm">
                  {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
                    <div key={k}>
                      <p className="font-medium text-gray-600 capitalize">{k}</p>
                      <p className="text-gray-800">{prevNote[k] || "—"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddendumForm({ onSubmit, pending }: { onSubmit: (c: string) => void; pending: boolean }) {
  const { t } = useTranslation(["soap"]);
  const [content, setContent] = useState("");
  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <p className="text-sm font-semibold text-gray-700">{t("soap:addAddendum")}</p>
      <textarea
        className={textareaCls}
        placeholder={t("soap:addendumPlaceholder")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button
        size="sm"
        disabled={pending || !content.trim()}
        onClick={() => {
          onSubmit(content);
          setContent("");
        }}
      >
        {pending ? t("soap:adding") : t("soap:addAddendum")}
      </Button>
    </div>
  );
}

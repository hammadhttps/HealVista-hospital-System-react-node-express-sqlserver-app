import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2, Lock, ScrollText, Sparkles, Undo2 } from "lucide-react";
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
  label: string;
  hint: string;
}[] = [
  {
    key: "subjective",
    label: "Subjective",
    hint: "Patient's own words — symptoms, history of present illness.",
  },
  {
    key: "objective",
    label: "Objective",
    hint: "Observations — vitals, exam findings, test results.",
  },
  {
    key: "assessment",
    label: "Assessment",
    hint: "Clinical assessment and differentials. Required to sign.",
  },
  { key: "plan", label: "Plan", hint: "Treatment plan, tests, follow-up. Required to sign." },
];

export default function SOAPNoteEditor() {
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
            toast.error("Autosave failed");
          },
        },
      );
    }, 1200);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, locked, isDirty, aiDraft]);

  const templateList = useMemo(() => (templates ?? []) as NoteTemplateRow[], [templates]);

  function applyTemplate(templateId: string) {
    const t = templateList.find((x) => x.id === templateId);
    if (!t) return;
    if (t.subjective) setValue("subjective", t.subjective);
    if (t.objective) setValue("objective", t.objective);
    if (t.assessment) setValue("assessment", t.assessment);
    if (t.plan) setValue("plan", t.plan);
    toast.success(`Template "${t.name}" applied`);
  }

  function onDraftWithAi() {
    draftMutation.mutate(undefined, {
      onSuccess: (result) => {
        setValue("subjective", result.draft.subjective);
        setValue("objective", result.draft.objective);
        setValue("assessment", result.draft.assessment);
        setValue("plan", result.draft.plan);
        setAiDraft(result.draft);
        toast.success(
          result.fallback ? "Draft applied (rule-based — AI unavailable)" : "AI draft applied",
        );
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
    toast.info("AI draft discarded");
  }

  function onSign() {
    const { assessment, plan } = values;
    if (isUneditedAiDraft()) {
      toast.error("Edit the AI draft before signing — an unedited draft cannot become your note");
      return;
    }
    if (!assessment.trim() || !plan.trim()) {
      toast.error("Assessment and plan are required before signing");
      return;
    }
    signMutation.mutate(undefined, {
      onSuccess: () => toast.success("Note signed"),
      onError: (e) => toast.error(e.message),
    });
  }

  function onAddendum(content: string) {
    if (!content.trim()) {
      toast.error("An addendum needs content");
      return;
    }
    addendumMutation.mutate(content, {
      onSuccess: () => toast.success("Addendum added"),
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
          <h1 className="text-2xl font-bold">{appointment?.patient?.fullName ?? "Consultation"}</h1>
          {appointment?.patient?.mrn && (
            <span className="font-mono text-sm text-gray-500">{appointment.patient.mrn}</span>
          )}
          {signed ? (
            <Badge variant="default">Signed</Badge>
          ) : (
            <Badge variant="warning">Draft</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {appointment?.doctor?.fullName && <span>Dr. {appointment.doctor.fullName}</span>}
          {appointment?.slot?.startTime && (
            <span>{new Date(appointment.slot.startTime).toLocaleString()}</span>
          )}
          <span className="flex items-center gap-1">
            {autosaveState === "saving" && <span className="text-gray-400">Saving…</span>}
            {autosaveState === "saved" && (
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </span>
        </div>
      </div>

      {!note && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          No note yet — start typing; drafts autosave.
        </div>
      )}

      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
          <Lock className="h-4 w-4" /> This note is locked. Add an addendum below — a signed note is
          not edited after 24 hours.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* SOAP editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> SOAP note
              </span>
              <span className="flex items-center gap-2">
                {aiDraft && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={discardAiDraft}
                    disabled={locked}
                    title="Remove the AI draft and revert to the saved note"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Discard
                  </Button>
                )}
                {templateList.length > 0 && (
                  <select
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value=""
                    onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                  >
                    <option value="">Apply template…</option>
                    {templateList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
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
                  {draftMutation.isPending ? "Drafting…" : "Draft with AI"}
                </Button>
              </span>
            </CardTitle>
            {aiDraft && (
              <p className="text-xs text-blue-700">
                AI draft applied — sections you haven't edited are highlighted. The note is not
                saved until you edit and it autosaves.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <form id="soap-form" onSubmit={handleSubmit(() => {})}>
              {SOAP_FIELDS.map((f) => {
                const aiUnedited = isAiUneditedSection(f.key);
                return (
                  <div key={f.key} className="space-y-1">
                    <label className={labelCls}>
                      {f.label}{" "}
                      <span className="text-xs font-normal text-gray-400">— {f.hint}</span>
                      {aiUnedited && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          <Sparkles className="h-3 w-3" /> AI
                        </span>
                      )}
                    </label>
                    <textarea
                      className={`${textareaCls} ${
                        aiUnedited ? "border-blue-300 bg-blue-50/60 focus:border-blue-500" : ""
                      }`}
                      disabled={locked}
                      placeholder={f.label}
                      {...register(f.key)}
                    />
                  </div>
                );
              })}
              <div className="space-y-1">
                <label className={labelCls}>Diagnosis codes</label>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  disabled={locked}
                  placeholder="Comma separated, e.g. I10, E11.9"
                  {...register("diagnosisCodes")}
                />
              </div>
            </form>

            {draftMutation.isPending && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                Assembling a draft from this visit's complaint, vitals, and recent labs…
              </div>
            )}

            {!locked && <AIDisclaimer />}

            {!locked && (
              <div className="flex items-center justify-between">
                <Button form="soap-form" type="submit" disabled={saveMutation.isPending}>
                  Save draft
                </Button>
                <Button onClick={onSign} disabled={signMutation.isPending}>
                  {signMutation.isPending ? "Signing…" : "Sign note"}
                </Button>
              </div>
            )}

            {noteRow && noteRow.addenda && noteRow.addenda.length > 0 && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-700">Addenda</p>
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
              <CardTitle className="text-base">Previous visit</CardTitle>
            </CardHeader>
            <CardContent>
              {!prevNote ? (
                <EmptyState title="No previous note" />
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
  const [content, setContent] = useState("");
  return (
    <div className="space-y-2 border-t border-gray-100 pt-4">
      <p className="text-sm font-semibold text-gray-700">Add addendum</p>
      <textarea
        className={textareaCls}
        placeholder="Correction or follow-up note…"
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
        {pending ? "Adding…" : "Add addendum"}
      </Button>
    </div>
  );
}

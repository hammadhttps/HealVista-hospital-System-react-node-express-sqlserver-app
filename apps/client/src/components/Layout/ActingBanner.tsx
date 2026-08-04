import { UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDependents } from "../../hooks/queries/useClinical";
import { useActingPatientStore } from "../../store/actingPatientStore";

interface DependentLink {
  relationshipId: string;
  relationship: string;
  patient: { id: string; fullName: string; mrn: string };
}

/**
 * The "acting for {name}" banner. Shown between the header and the page content the
 * moment a guardian switches to a dependant's profile, so the current view context is
 * never ambiguous — and trivially reversible.
 */
export default function ActingBanner() {
  const actingPatientId = useActingPatientStore((s) => s.actingPatientId);
  const setActingPatient = useActingPatientStore((s) => s.setActingPatient);
  const { data } = useDependents();
  const { t } = useTranslation(["profile", "common"]);

  if (!actingPatientId) return null;

  const dependents = (data ?? []) as DependentLink[];
  const name =
    dependents.find((d) => d.patient.id === actingPatientId)?.patient.fullName ??
    t("profile:dependantFallback");

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-8 py-2 text-sm font-medium text-primary-foreground">
      <span className="flex items-center gap-2">
        <UserRoundCheck className="h-4 w-4 shrink-0" />
        {t("profile:actingFor", { name })} — {t("profile:actingContext")}
      </span>
      <button
        type="button"
        onClick={() => setActingPatient(null)}
        className="shrink-0 underline underline-offset-2 hover:text-primary-foreground/80"
      >
        {t("profile:switchBackToMe")}
      </button>
    </div>
  );
}

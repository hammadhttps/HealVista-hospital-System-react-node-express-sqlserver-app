import { UserRoundCheck } from "lucide-react";
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

  if (!actingPatientId) return null;

  const dependents = (data ?? []) as DependentLink[];
  const name =
    dependents.find((d) => d.patient.id === actingPatientId)?.patient.fullName ?? "dependant";

  return (
    <div className="flex items-center justify-between gap-3 bg-blue-600 px-8 py-2 text-sm font-medium text-white">
      <span className="flex items-center gap-2">
        <UserRoundCheck className="h-4 w-4 shrink-0" />
        Acting for {name} — records, appointments and bills now use this profile.
      </span>
      <button
        type="button"
        onClick={() => setActingPatient(null)}
        className="shrink-0 underline underline-offset-2 hover:text-blue-100"
      >
        Switch back to me
      </button>
    </div>
  );
}

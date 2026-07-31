import { UserRound } from "lucide-react";
import { useDependents } from "../../hooks/queries/useClinical";
import { useActingPatientStore } from "../../store/actingPatientStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface DependentLink {
  relationshipId: string;
  relationship: string;
  canViewRecords: boolean;
  patient: { id: string; fullName: string; mrn: string };
}

/**
 * The profile switcher — "act as" for a guardian. Only patients can be guardians, so
 * this renders solely for the PATIENT role (see Header).
 *
 * Selecting a dependant sets the acting-patient context; the banner in AppShell makes
 * that state visible and reversible. The server independently enforces that only a
 * linked dependant can be acted for.
 */
export default function ProfileSwitcher() {
  const actingPatientId = useActingPatientStore((s) => s.actingPatientId);
  const setActingPatient = useActingPatientStore((s) => s.setActingPatient);
  const { data, isLoading } = useDependents();

  const dependents = (data ?? []) as DependentLink[];
  const value = actingPatientId ?? "me";

  return (
    <div className="flex items-center gap-1.5">
      <UserRound className="h-4 w-4 text-gray-400" />
      <Select value={value} onValueChange={(v) => setActingPatient(v === "me" ? null : v)}>
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder={isLoading ? "Loading…" : "Acting profile"} />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="me">Me</SelectItem>
          {dependents.map((d) => (
            <SelectItem key={d.relationshipId} value={d.patient.id}>
              {d.patient.fullName} · {d.relationship}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

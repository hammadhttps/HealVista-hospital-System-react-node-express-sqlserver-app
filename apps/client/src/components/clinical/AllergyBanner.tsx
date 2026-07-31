import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "../ui/badge";

interface Allergy {
  id: string;
  allergen: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
  reaction?: string | null;
  confirmedAt?: string | null;
}

/**
 * The allergy banner. Permanent, red, unmissable, on every patient record header —
 * a missed severe allergy is a patient-safety event, so this is never collapsed or
 * tucked behind a tab. The header row renders it regardless of which tab is open.
 */
export default function AllergyBanner({
  allergies,
  isLoading,
}: {
  allergies: Allergy[] | undefined;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Checking allergy record…
      </div>
    );
  }

  if (!allergies || allergies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        No known allergies on record
      </div>
    );
  }

  const severe = allergies.filter((a) => a.severity === "SEVERE");
  const tone = severe.length > 0 ? "red" : "amber";

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 ${
        tone === "red"
          ? "border-red-500 bg-red-50 text-red-900"
          : "border-amber-400 bg-amber-50 text-amber-900"
      }`}
      role="alert"
    >
      <AlertTriangle
        className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "red" ? "text-red-600" : "text-amber-600"}`}
      />
      <div className="space-y-1">
        <p className="text-sm font-bold uppercase tracking-wide">
          Allergies — {severe.length > 0 ? "severe" : "review before prescribing"}
        </p>
        <div className="flex flex-wrap gap-2">
          {allergies.map((a) => (
            <Badge
              key={a.id}
              variant={a.severity === "SEVERE" ? "destructive" : "warning"}
              className="text-xs"
            >
              {a.allergen} · {a.severity}
              {a.reaction ? ` · ${a.reaction}` : ""}
              {!a.confirmedAt ? " · unconfirmed" : ""}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

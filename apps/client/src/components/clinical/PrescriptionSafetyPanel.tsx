import { useTranslation } from "react-i18next";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";

export interface SafetyWarning {
  kind: "allergy" | "interaction";
  severity: "MILD" | "MODERATE" | "SEVERE";
  blocking: boolean;
  medicineName?: string;
  allergen?: string;
  reaction?: string | null;
  drugA?: string;
  drugB?: string;
  description?: string;
}

const SEVERITY_KEYS: Record<string, string> = {
  MILD: "prescription:severityMild",
  MODERATE: "prescription:severityModerate",
  SEVERE: "prescription:severitySevere",
};

export function warningKey(w: SafetyWarning): string {
  return w.kind === "allergy"
    ? `allergy:${w.medicineName}:${w.allergen}`
    : `interaction:${w.drugA}:${w.drugB}`;
}

/**
 * Prescribing safety warnings.
 *
 * The visual hierarchy is doing real work here. A blocking allergy has no checkbox at
 * all — offering one implies the doctor could tick past it, and they cannot. Warnings
 * that *are* overridable each need their own acknowledgement, because a single "I
 * accept all" button is how a real interaction gets waved through alongside a trivial
 * one.
 */
export function PrescriptionSafetyPanel({
  warnings,
  acknowledged,
  onToggleAcknowledge,
}: {
  warnings: SafetyWarning[];
  acknowledged: Set<string>;
  onToggleAcknowledge: (key: string) => void;
}) {
  const { t } = useTranslation(["prescription", "common"]);

  if (warnings.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950">
        <CardContent className="p-4 text-sm text-emerald-900 dark:text-emerald-100">
          {t("prescription:noConflicts")}
        </CardContent>
      </Card>
    );
  }

  const blocking = warnings.filter((w) => w.blocking);
  const overridable = warnings.filter((w) => !w.blocking);

  return (
    <div className="space-y-3">
      {blocking.map((w) => (
        <Card
          key={warningKey(w)}
          className="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
        >
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">{t("prescription:blocked")}</Badge>
              <Badge variant="destructive">{t(SEVERITY_KEYS[w.severity] ?? w.severity)}</Badge>
            </div>
            <p className="font-semibold text-red-900 dark:text-red-100">
              {t("prescription:conflictsWithAllergy", {
                medicine: w.medicineName,
                allergen: w.allergen,
              })}
            </p>
            {w.reaction && (
              <p className="text-sm text-red-800 dark:text-red-200">
                {t("prescription:recordedReaction", { reaction: w.reaction })}
              </p>
            )}
            <p className="text-sm text-red-800 dark:text-red-200">
              {t("prescription:cannotOverride")}
            </p>
          </CardContent>
        </Card>
      ))}

      {overridable.map((w) => {
        const key = warningKey(w);
        return (
          <Card
            key={key}
            className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
          >
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="warning">{t(SEVERITY_KEYS[w.severity] ?? w.severity)}</Badge>
                <span className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  {t(
                    w.kind === "allergy"
                      ? "prescription:kindAllergy"
                      : "prescription:kindInteraction",
                  )}
                </span>
              </div>

              {w.kind === "allergy" ? (
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  {t("prescription:mayConflictWithAllergy", {
                    medicine: w.medicineName,
                    allergen: w.allergen,
                    reaction: w.reaction ? ` (${w.reaction})` : "",
                  })}
                </p>
              ) : (
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  {t("prescription:interactionDescription", {
                    drugA: w.drugA,
                    drugB: w.drugB,
                    description: w.description,
                  })}
                </p>
              )}

              <label className="flex cursor-pointer items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledged.has(key)}
                  onChange={() => onToggleAcknowledge(key)}
                />
                <span>{t("prescription:reviewWarningAck")}</span>
              </label>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

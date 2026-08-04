import { useState } from "react";
import { Stethoscope, Send, Loader2, Siren } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSymptomCheck } from "../../hooks/mutations/useAiMutations";
import { useMatchBySymptom } from "../../hooks/mutations/useAppointmentMutations";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { getErrorMessage } from "../../utils/errors";

/**
 * Symptom checker on the doctor-search page. Emergency phrasing short-circuits
 * server-side (deterministic, before any model call) to a contact-services message.
 * When the checker suggests a department, "Find doctors" prefilters the doctor list
 * with it — the accepting suggestion becomes real filters, not a dead end.
 */
export default function SymptomChecker({
  onMatchDepartment,
}: {
  onMatchDepartment: (departmentId: string) => void;
}) {
  const { t } = useTranslation("ai");
  const check = useSymptomCheck();
  const match = useMatchBySymptom();
  const [symptom, setSymptom] = useState("");
  const [matched, setMatched] = useState<{
    departmentId: string;
    departmentName: string;
  } | null>(null);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const text = symptom.trim();
    if (!text || check.isPending) return;
    setMatched(null);
    check.mutate(text);
  }

  function findDoctors(slug: string, name: string) {
    // The /doctors/match endpoint resolves the slug to a real department id and
    // returns matching doctors; accepting the suggestion jumps straight there.
    match.mutate(symptom.trim(), {
      onSuccess: (res: { suggestions?: { slug: string; departmentId?: string }[] }) => {
        const suggestion = res.suggestions?.find((s) => s.slug === slug);
        setMatched({ departmentId: suggestion?.departmentId ?? "", departmentName: name });
        if (suggestion?.departmentId) onMatchDepartment(suggestion.departmentId);
        else onMatchDepartment(""); // fall through to a plain search
      },
      onError: () => onMatchDepartment(""),
    });
  }

  const result = check.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="h-4 w-4" /> {t("symptomChecker")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={run} className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            placeholder={t("symptomPlaceholder")}
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            disabled={check.isPending}
          />
          <Button type="submit" disabled={check.isPending || !symptom.trim()}>
            {check.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {check.isError && <p className="text-sm text-red-600">{getErrorMessage(check.error)}</p>}

        {result && (
          <div className="space-y-3">
            {result.type === "emergency" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                <Siren className="mt-0.5 h-4 w-4 shrink-0" /> {result.response}
              </div>
            )}
            {result.type !== "emergency" && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {result.response}
                {result.type === "clarifying_question" &&
                  result.clarifyingQuestions?.length > 0 && (
                    <ul className="mt-2 list-disc pl-5">
                      {result.clarifyingQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  )}
              </div>
            )}
            {result.type === "department_suggestion" && result.department && (
              <Button
                size="sm"
                onClick={() => findDoctors(result.department!, result.department!)}
                disabled={check.isPending || match.isPending}
              >
                {match.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t("findDoctors", {
                      department: result.department.replace("-", " "),
                    })}
                  </>
                )}
              </Button>
            )}
            {matched && (
              <p className="text-xs text-green-700">
                {t("showingDoctors", { department: matched.departmentName })}
              </p>
            )}
          </div>
        )}

        <AIDisclaimer />
      </CardContent>
    </Card>
  );
}

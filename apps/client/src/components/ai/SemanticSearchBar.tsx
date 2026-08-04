import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Search } from "lucide-react";
import { useSemanticSearchAll } from "../../hooks/mutations/useAiMutations";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { getErrorMessage } from "../../utils/errors";

const SOURCE_LABEL_KEYS: Record<string, string> = {
  consultation_note: "ai:sourceConsultationNote",
  lab_report: "ai:sourceLabReport",
  prescription: "ai:sourcePrescription",
  medical_record: "ai:sourceMedicalRecord",
};

function sourceLabel(sourceType: string, t: TFunction): string {
  const key = SOURCE_LABEL_KEYS[sourceType];
  if (key) return t(key);
  return sourceType.replace(/_/g, " ");
}

/**
 * Semantic search over the doctor's whole patient panel — "patients with worsening
 * blood sugar" surfaces the matching notes and labs from every patient they treat,
 * each result linking to that patient's record. Runs on submit (a POST, never from
 * cache) so a fresh diagnosis is found even if the embedding was just added.
 */
export default function SemanticSearchBar() {
  const { t } = useTranslation(["ai", "common"]);
  const searchAll = useSemanticSearchAll();
  const [query, setQuery] = useState("");

  function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || searchAll.isPending) return;
    searchAll.mutate({ query: q });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none"
            placeholder={t("ai:searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={searchAll.isPending}
          />
        </div>
        <Button type="submit" disabled={searchAll.isPending || !query.trim()}>
          {searchAll.isPending ? t("ai:searching") : t("common:search")}
        </Button>
      </form>

      {searchAll.isError && (
        <p className="text-sm text-red-500">{getErrorMessage(searchAll.error)}</p>
      )}

      {searchAll.isPending && (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-gray-200" />
            ))}
          </CardContent>
        </Card>
      )}

      {searchAll.data && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {searchAll.data.results.length === 0 ? (
              <p className="text-sm text-gray-500">{t("ai:noMatches")}</p>
            ) : (
              searchAll.data.results.map((hit) => (
                <div key={hit.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {hit.patientName ? (
                      <Link
                        to={`/patients/${hit.patientId}`}
                        className="text-sm font-semibold text-teal-700 hover:underline"
                      >
                        {hit.patientName}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-gray-700">
                        {t("ai:unknownPatient")}
                      </span>
                    )}
                    <Badge variant="outline">{sourceLabel(hit.sourceType, t)}</Badge>
                    <span className="text-xs text-gray-400">
                      {t("ai:match", { value: (hit.similarity * 100).toFixed(0) })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{hit.content}</p>
                </div>
              ))
            )}
            {searchAll.data.fallback && (
              <p className="text-xs text-amber-700">{t("ai:searchUnavailable")}</p>
            )}
          </CardContent>
        </Card>
      )}

      <AIDisclaimer />
    </div>
  );
}

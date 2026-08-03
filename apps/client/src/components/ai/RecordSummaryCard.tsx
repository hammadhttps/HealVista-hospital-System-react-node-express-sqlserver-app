import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRecordSummary } from "../../hooks/queries/useAi";
import { useSummarizeRecord } from "../../hooks/mutations/useAiMutations";
import { useAuthStore } from "../../store/authStore";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { Skeleton } from "../primitives/Skeleton";
import { getErrorMessage } from "../../utils/errors";

/**
 * AI summary card for a single medical record.
 *
 * Lazy by design: the summary is fetched only when the doctor expands the card.
 * `getReportSummary` is an *audited* read (MEDICAL_RECORD_SUMMARY_VIEWED), so
 * fetching every record's summary on mount would spam the audit log before anyone
 * asked. Expanding fetches once; if the worker hasn't summarised this record yet,
 * the card offers to enqueue one and polls via a react-query refetch until it lands.
 */
export default function RecordSummaryCard({ recordId }: { recordId: string }) {
  const { t } = useTranslation("ai");
  const [expanded, setExpanded] = useState(false);
  const [polling, setPolling] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const canSummarize = role === "DOCTOR" || role === "ADMIN";
  const summary = useRecordSummary(recordId, expanded);
  const summarize = useSummarizeRecord(recordId);

  // Poll while a summarise job is in flight. The query refetches the server cache
  // (a GET), so this is a timer driving React Query — never a fetch in the effect.
  useEffect(() => {
    if (!polling) return;
    if (summary.data) {
      setPolling(false);
      return;
    }
    const t = setInterval(() => summary.refetch(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, summary.data]);

  if (!expanded) {
    return (
      <button
        className="flex w-full items-center justify-between gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-left"
        onClick={() => setExpanded(true)}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Sparkles className="h-3.5 w-3.5" /> {t("aiSummary")}
        </span>
        <ChevronDown className="h-4 w-4 text-blue-500" />
      </button>
    );
  }

  if (summary.isLoading) {
    return (
      <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50/50 p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Sparkles className="h-3.5 w-3.5" /> {t("aiSummary")}
        </span>
        <Skeleton className="h-8" />
      </div>
    );
  }

  const data = summary.data;
  const hasSummary = data && (data.plainLanguageSummary || (data.flags && data.flags.length > 0));

  return (
    <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Sparkles className="h-3.5 w-3.5" /> {t("aiSummary")}
        </span>
        {hasSummary && (
          <button className="text-blue-600 hover:text-blue-800" onClick={() => setExpanded(false)}>
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {hasSummary ? (
        <div className="mt-2 space-y-2 text-sm">
          {data.plainLanguageSummary && (
            <p className="text-gray-800">{data.plainLanguageSummary}</p>
          )}
          {data.flags && data.flags.length > 0 && (
            <ul className="list-disc pl-5 text-amber-800">
              {data.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          {data.keyValues && data.keyValues.length > 0 && (
            <div className="rounded-md border border-gray-200 bg-white p-2">
              {data.keyValues.map((kv, i) => (
                <div key={i} className="flex justify-between gap-2 py-0.5 text-xs">
                  <span className="text-gray-600">{kv.name}</span>
                  <span className="font-medium text-gray-800">
                    {kv.value}
                    {kv.referenceRange ? ` (ref ${kv.referenceRange})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          <AIDisclaimer />
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          {canSummarize ? (
            <Button
              size="sm"
              variant="outline"
              disabled={summarize.isPending || polling}
              onClick={() => {
                setPolling(true);
                summarize.mutate(undefined);
              }}
            >
              {summarize.isPending || polling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {summarize.isPending ? t("queuing") : polling ? t("waiting") : t("summarise")}
            </Button>
          ) : null}
          {summarize.isError && (
            <span className="text-xs text-red-600">{getErrorMessage(summarize.error)}</span>
          )}
          <AIDisclaimer />
        </div>
      )}
    </div>
  );
}

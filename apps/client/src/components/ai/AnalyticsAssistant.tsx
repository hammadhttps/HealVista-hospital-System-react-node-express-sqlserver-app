import { useState } from "react";
import { BarChart3, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAnalyticsAsk } from "../../hooks/mutations/useAiMutations";
import type { AnalyticsResult } from "../../api/ai";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { getErrorMessage } from "../../utils/errors";

/**
 * ADMIN analytics assistant (Phase 5.6). The backend runs parameterised aggregate
 * SQL and the model narrates the numbers — the model never authors SQL. The
 * rendered table is the raw aggregate result, so the narrative can't invent rows.
 */
export default function AnalyticsAssistant() {
  const { t } = useTranslation("ai");
  const ask = useAnalyticsAsk();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text || ask.isPending) return;
    setError(null);
    ask.mutate(text, {
      onSuccess: (res) => setResult(res),
      onError: (err) => setError(getErrorMessage(err)),
    });
  }

  const table = result?.table?.columns?.length ? result.table : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> {t("analyticsAsk")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">{t("analyticsAskHint")}</p>
        <form onSubmit={submit} className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={t("analyticsPlaceholder")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={ask.isPending}
          />
          <Button type="submit" size="sm" disabled={ask.isPending || !question.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <BarChart3 className="h-4 w-4 animate-pulse" /> {t("analyticsThinking")}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!ask.isPending && result?.answer && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm whitespace-pre-wrap text-gray-800">
            {result.answer}
          </div>
        )}

        {!ask.isPending && table && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium text-gray-600">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {table.columns.map((c) => (
                      <td key={c} className="px-3 py-2 text-gray-700">
                        {row[c] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!ask.isPending && result?.fallback && (
          <p className="text-xs text-gray-500">{t("analyticsFallback")}</p>
        )}

        <AIDisclaimer />
      </CardContent>
    </Card>
  );
}

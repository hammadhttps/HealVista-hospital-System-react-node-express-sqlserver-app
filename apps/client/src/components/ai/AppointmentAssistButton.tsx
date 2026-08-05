import { useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppointmentAssist } from "../../hooks/mutations/useAiMutations";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { getErrorMessage } from "../../utils/errors";

/**
 * "Ask about this appointment" — a patient's or doctor's per-appointment AI
 * assistant. Inline expansion so they never lose the appointment while reading the
 * answer. The server returns a deterministic fact sheet even when the AI is off, so
 * the panel always has something useful to show.
 */
export default function AppointmentAssistButton({ appointmentId }: { appointmentId: string }) {
  const { t } = useTranslation("ai");
  const assist = useAppointmentAssist();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    assist.mutate({ appointmentId });
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || assist.isPending) return;
    setInput("");
    assist.mutate({ appointmentId, question: text });
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={toggle} disabled={assist.isPending}>
        <span className="flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5" /> {t("appointmentAssist")}
        </span>
      </Button>

      {open && (
        <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <Sparkles className="h-3.5 w-3.5" /> {t("appointmentAssistHint")}
            </span>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setOpen(false)}
              aria-label={t("common:close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {assist.isError && (
            <p className="mt-2 text-sm text-red-600">{getErrorMessage(assist.error)}</p>
          )}

          {assist.data && (
            <div className="mt-2 space-y-3 text-sm">
              {assist.data.answer && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-teal-700">
                    {t("explanationTitle")}
                  </p>
                  <p className="whitespace-pre-wrap text-gray-800">{assist.data.answer}</p>
                </div>
              )}
              <div className="rounded-md border border-gray-200 bg-white p-2">
                <p className="mb-1 text-xs font-semibold text-gray-600">{t("factSheet")}</p>
                <p className="whitespace-pre-wrap text-xs text-gray-700">{assist.data.factSheet}</p>
              </div>
              {assist.data.fallback && !assist.data.answer && (
                <p className="text-amber-800">{t("analysisUnavailable")}</p>
              )}
            </div>
          )}

          <form onSubmit={ask} className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
              placeholder={t("appointmentAssistPlaceholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={assist.isPending}
            />
            <Button type="submit" size="sm" disabled={assist.isPending || !input.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>

          <AIDisclaimer className="mt-3" />
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useExplainLab } from "../../hooks/mutations/useAiMutations";
import AIDisclaimer from "./AIDisclaimer";
import { Button } from "../ui/button";
import { getErrorMessage } from "../../utils/errors";

/**
 * "Explain this to me" for a lab order. Inline expansion — the patient never loses
 * the report while reading the explanation, and the plain-language view is clearly
 * separated from the raw values it describes.
 */
export default function LabExplainButton({ orderId }: { orderId: string }) {
  const explain = useExplainLab();
  const [open, setOpen] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    explain.mutate(orderId);
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={toggle} disabled={explain.isPending}>
        {explain.isPending ? (
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Explaining…
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Explain this to me
          </span>
        )}
      </Button>

      {open && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" /> Plain-language explanation
            </span>
            <button className="text-gray-400 hover:text-gray-600" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {explain.isError && (
            <p className="mt-2 text-sm text-red-600">{getErrorMessage(explain.error)}</p>
          )}

          {explain.data && (
            <div className="mt-2 space-y-3 text-sm">
              {explain.data.explanation && (
                <p className="whitespace-pre-wrap text-gray-800">{explain.data.explanation}</p>
              )}
              {explain.data.highlights.length > 0 && (
                <div className="rounded-md border border-gray-200 bg-white p-2">
                  {explain.data.highlights.map((h, i) => (
                    <div key={i} className="flex justify-between gap-2 py-0.5 text-xs">
                      <span className="text-gray-600">{h.test}</span>
                      <span className="font-medium text-gray-800">
                        {h.value}
                        {h.flag ? ` [${h.flag}]` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {explain.data.fallback && !explain.data.explanation && (
                <p className="text-amber-800">
                  The AI explanation is unavailable right now — the values above are the report's
                  own numbers.
                </p>
              )}
            </div>
          )}

          <AIDisclaimer className="mt-3" />
        </div>
      )}
    </div>
  );
}

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Rendered on EVERY AI surface — the app's guarantee that no AI feature appears
 * without the disclaimer attached. Per ai-rag.md the assistant is assistive, never
 * diagnostic; this line carries that message in the UI.
 */
export default function AIDisclaimer({ className = "" }: { className?: string }) {
  const { t } = useTranslation("ai");
  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800 ${className}`}
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{t("disclaimer")}</p>
    </div>
  );
}

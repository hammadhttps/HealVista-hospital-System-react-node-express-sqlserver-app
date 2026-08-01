import { Sparkles } from "lucide-react";

/**
 * Rendered on EVERY AI surface — the app's guarantee that no AI feature appears
 * without the disclaimer attached. Per ai-rag.md the assistant is assistive, never
 * diagnostic; this line carries that message in the UI.
 */
export default function AIDisclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 ${className}`}
    >
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        AI-generated — for guidance only. Not a diagnosis and not a substitute for professional
        medical advice. A clinician reviews everything before it becomes part of your record.
      </p>
    </div>
  );
}

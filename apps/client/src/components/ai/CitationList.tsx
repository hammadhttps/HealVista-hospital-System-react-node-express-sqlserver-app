import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ExternalLink } from "lucide-react";
import type { AICitation, KbCitation } from "../../api/ai";

export type Citation = AICitation | KbCitation;

const SOURCE_LABEL_KEYS: Record<string, string> = {
  consultation_note: "ai:sourceConsultationNote",
  lab_report: "ai:sourceLabReport",
  prescription: "ai:sourcePrescription",
  medical_record: "ai:sourceMedicalRecord",
  kb_article: "ai:sourceKbArticle",
};

function sourceLabel(sourceType: string, t: TFunction): string {
  const key = SOURCE_LABEL_KEYS[sourceType];
  if (key) return t(key);
  return sourceType.replace(/_/g, " ");
}

/**
 * Where each cited source lives. Clinical chunks link to the patient's page; KB
 * articles to the knowledge base. `role` shapes the patient link so a doctor lands
 * on the staff record view and a patient on their own records.
 */
function citationHref(c: Citation, role?: string): string {
  if (c.sourceType === "kb_article") return `/kb/${c.sourceId}`;
  if ("patientId" in c && c.patientId) {
    return role === "PATIENT" ? "/patient/records" : `/patients/${c.patientId}`;
  }
  return "#";
}

/**
 * Links every chunk the assistant cited back to its source record. Citations are
 * the whole point of RAG over a siloed record: without them an answer is an
 * unverifiable claim about a patient.
 */
export default function CitationList({
  citations,
  role,
  className = "",
}: {
  citations: Citation[];
  role?: string;
  className?: string;
}) {
  const { t } = useTranslation(["ai"]);
  if (!citations.length) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {t("ai:sources")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => {
          const href = citationHref(c, role);
          const label =
            c.sourceType === "kb_article" && "title" in c && c.title
              ? c.title
              : sourceLabel(c.sourceType, t);
          return (
            <Link
              key={`${c.sourceType}-${c.sourceId}-${i}`}
              to={href}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-teal-300 hover:text-teal-700"
            >
              {label}
              <ExternalLink className="h-3 w-3" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import { useTimelineSummary } from "../../hooks/queries/useAi";
import AssistantChat from "./AssistantChat";
import AIDisclaimer from "./AIDisclaimer";
import CitationList from "./CitationList";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../primitives/Skeleton";
import { Bot } from "lucide-react";

/**
 * The doctor's AI panel on a patient's record. Timeline summary loads once from
 * the server-side cache; the chat runs the doctor-scoped assistant against this
 * patient. Both surface their citations so the doctor can verify against the source.
 */
export default function DoctorAssistantPanel({ patientId }: { patientId: string }) {
  const timeline = useTimelineSummary(patientId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Timeline summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.isLoading && <Skeleton className="h-24" />}
          {timeline.isError && (
            <p className="text-sm text-red-500">Could not load the timeline summary.</p>
          )}
          {timeline.data && (
            <div className="space-y-3">
              <p className="text-sm whitespace-pre-wrap text-gray-800">{timeline.data.summary}</p>
              <CitationList citations={timeline.data.citations} role="DOCTOR" />
              <AIDisclaimer />
            </div>
          )}
        </CardContent>
      </Card>

      <AssistantChat patientId={patientId} role="DOCTOR" title="Assistant for this patient" />
    </div>
  );
}

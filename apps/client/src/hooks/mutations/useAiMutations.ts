import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { aiApi, kbApi, analyticsApi, soapDraftApi } from "../../api/ai";
import { aiKeys, kbKeys } from "../queries/useAi";
import { getErrorMessage } from "../../utils/errors";

/**
 * AI interactions are POSTs (single stateless turns) that must never come from
 * cache — an allergy recorded thirty seconds ago changes the assistant's answer.
 * They are mutations even though nothing is written: the request is the point.
 */
export function useAssistant() {
  return useMutation({
    mutationFn: ({ question, patientId }: { question: string; patientId?: string }) =>
      aiApi.assistant(question, patientId),
  });
}

export function useSemanticSearch() {
  return useMutation({
    mutationFn: ({ query, patientId, k }: { query: string; patientId: string; k?: number }) =>
      aiApi.semanticSearch(query, patientId, k),
  });
}

export function useSemanticSearchAll() {
  return useMutation({
    mutationFn: ({ query, k }: { query: string; k?: number }) => aiApi.semanticSearchAll(query, k),
  });
}

export function useExplainLab() {
  return useMutation({ mutationFn: aiApi.explainLab });
}

export function useSummarizeRecord(recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aiApi.summarizeRecord(recordId),
    onSuccess: () => {
      toast.success("Summary requested — it will appear here once ready");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: aiKeys.recordSummary(recordId) });
    },
  });
}

export function useSymptomCheck() {
  return useMutation({
    mutationFn: aiApi.symptomCheck,
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useAppointmentAssist() {
  return useMutation({
    mutationFn: ({ appointmentId, question }: { appointmentId: string; question?: string }) =>
      aiApi.appointmentAssist(appointmentId, question),
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

// ─── Hospital knowledge base ────────────────────────────────────────────────

export function useKbAsk() {
  return useMutation({
    mutationFn: kbApi.ask,
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useCreateKbArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: kbApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.list });
      toast.success("Article saved");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateKbArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof kbApi.update>[1] }) =>
      kbApi.update(id, input),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: kbKeys.list });
      queryClient.invalidateQueries({ queryKey: kbKeys.detail(id) });
      toast.success("Article updated");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteKbArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: kbApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbKeys.list });
      toast.success("Article unpublished");
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

// ─── Analytics assistant (ADMIN) ────────────────────────────────────────────

export function useAnalyticsAsk() {
  return useMutation({
    mutationFn: analyticsApi.ask,
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

// ─── SOAP draft ─────────────────────────────────────────────────────────────

export function useGenerateSoapDraft(appointmentId: string) {
  return useMutation({
    mutationFn: () => soapDraftApi.generate(appointmentId),
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

import api from "./axiosClient";

/** A cited record the assistant used to build its answer. */
export interface AICitation {
  sourceType: string;
  sourceId: string;
  patientId: string | null;
  similarity: number;
}

export interface AssistantResult {
  answer: string;
  citations: AICitation[];
  fallback: boolean;
}

export interface TimelineSummaryResult {
  summary: string;
  citations: AICitation[];
  fallback: boolean;
}

export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  patientId: string | null;
  content: string;
  chunkIndex: number;
  similarity: number;
}

export interface SemanticSearchResult {
  results: SearchHit[];
  fallback: boolean;
}

export interface ScopeSearchHit extends SearchHit {
  patientName: string | null;
}

export interface SemanticSearchAllResult {
  results: ScopeSearchHit[];
  fallback: boolean;
}

export interface KbArticleRow {
  id: string;
  title: string;
  slug: string;
  category: string;
  isPublished: boolean;
  departmentId: string | null;
  updatedAt: string;
}

export interface KbArticle extends KbArticleRow {
  content: string;
}

export interface KbCitation {
  sourceType: string;
  sourceId: string;
  title: string | null;
}

export interface KbAskResult {
  answer: string;
  citations: KbCitation[];
  fallback: boolean;
}

export interface AnalyticsTable {
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export interface AnalyticsResult {
  intent: string;
  answer: string | null;
  table: AnalyticsTable;
  fallback: boolean;
}

export type SymptomCheckResult =
  | {
      type: "emergency";
      response: string;
      department: null;
      clarifyingQuestions: [];
      fallback: false;
    }
  | {
      type: "clarifying_question" | "department_suggestion" | "general_advice";
      response: string;
      department: string | null;
      clarifyingQuestions: string[];
      fallback: boolean;
    };

export interface LabExplainResult {
  explanation: string | null;
  highlights: { test: string; value: string; flag: string | null; note: string }[];
  fallback: boolean;
}

export interface RecordSummary {
  keyValues?: { name: string; value: string; referenceRange: string | null }[];
  flags?: string[];
  plainLanguageSummary?: string;
  generatedAt?: string;
  model?: string;
  fallback?: boolean;
}

export interface AppointmentAssistResult {
  answer: string | null;
  factSheet: string;
  fallback: boolean;
}

export interface SoapDraftResult {
  draft: { subjective: string; objective: string; assessment: string; plan: string };
  source: "ai" | "rules";
  fallback: boolean;
}

export const aiApi = {
  /** RAG assistant — patient's own records, or a doctor's named patient. */
  assistant: (question: string, patientId?: string) =>
    api
      .post<{ data: AssistantResult }>("/ai/assistant", { question, patientId })
      .then((r) => r.data.data),

  /** Chronological summary of one patient's recent history. */
  timelineSummary: (patientId: string) =>
    api
      .get<{ data: TimelineSummaryResult }>(`/ai/timeline-summary/${patientId}`)
      .then((r) => r.data.data),

  /** Doctor-facing semantic search across a patient's records. */
  semanticSearch: (query: string, patientId: string, k?: number) =>
    api
      .post<{ data: SemanticSearchResult }>("/ai/search", { query, patientId, k })
      .then((r) => r.data.data),

  /** Doctor-facing search across the whole panel — no single patient. */
  semanticSearchAll: (query: string, k?: number) =>
    api
      .post<{ data: SemanticSearchAllResult }>("/ai/search-all", { query, k })
      .then((r) => r.data.data),

  /** Lab report explanation — plain-language, no diagnosis. */
  explainLab: (orderId: string) =>
    api.post<{ data: LabExplainResult }>(`/ai/lab/${orderId}/explain`).then((r) => r.data.data),

  /** Stored report summary, or null when none exists yet. */
  recordSummary: (recordId: string) =>
    api
      .get<{ data: RecordSummary | null }>(`/ai/records/${recordId}/summary`)
      .then((r) => r.data.data),

  /** Enqueues a report-summary job; the worker writes MedicalRecord.aiSummary. */
  summarizeRecord: (recordId: string) =>
    api
      .post<{ data: { queued: boolean } }>(`/ai/records/${recordId}/summarize`)
      .then((r) => r.data.data),

  /** Stateless symptom-checker turn. Emergency short-circuits server-side. */
  symptomCheck: (message: string) =>
    api
      .post<{ data: SymptomCheckResult }>("/ai/symptom-check", { message })
      .then((r) => r.data.data),

  /** Guided answer about a specific appointment — patient's own, or doctor's. */
  appointmentAssist: (appointmentId: string, question?: string) =>
    api
      .post<{ data: AppointmentAssistResult }>(`/ai/appointments/${appointmentId}/assist`, {
        question,
      })
      .then((r) => r.data.data),
};

export const kbApi = {
  /** Everyone authenticated can read and ask (patients get general Q&A). */
  list: () => api.get<{ data: KbArticleRow[] }>("/ai/kb").then((r) => r.data.data),
  get: (id: string) => api.get<{ data: KbArticle }>(`/ai/kb/${id}`).then((r) => r.data.data),
  ask: (question: string) =>
    api.post<{ data: KbAskResult }>("/ai/kb/ask", { question }).then((r) => r.data.data),
  create: (input: {
    title: string;
    content: string;
    category: string;
    slug?: string;
    departmentId?: string | null;
    isPublished?: boolean;
  }) => api.post<{ data: KbArticle }>("/ai/kb", input).then((r) => r.data.data),
  update: (
    id: string,
    input: Partial<{
      title: string;
      content: string;
      category: string;
      slug?: string;
      departmentId?: string | null;
      isPublished?: boolean;
    }>,
  ) => api.put<{ data: KbArticle }>(`/ai/kb/${id}`, input).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/ai/kb/${id}`).then((r) => r.data.data),
};

export const analyticsApi = {
  ask: (question: string) =>
    api.post<{ data: AnalyticsResult }>("/ai/analytics", { question }).then((r) => r.data.data),
};

export const soapDraftApi = {
  /** Returns AI-drafted SOAP text. Persists nothing — the doctor must edit before save. */
  generate: (appointmentId: string) =>
    api
      .post<{ data: SoapDraftResult }>(`/appointments/${appointmentId}/note/draft`)
      .then((r) => r.data.data),
};

import { useState } from "react";
import { Send, Bot, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAssistant } from "../../hooks/mutations/useAiMutations";
import AIDisclaimer from "./AIDisclaimer";
import CitationList, { type Citation } from "./CitationList";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { getErrorMessage } from "../../utils/errors";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: boolean;
}

/**
 * RAG assistant chat. One component serves both the patient dashboard (own records
 * only — no patientId) and the doctor's patient-record panel (named patient, which
 * the server verifies against the doctor's retrieval scope). The conversation is
 * client state — an in-progress chat — never cached server data.
 */
export default function AssistantChat({
  patientId,
  role,
  title,
  compact = false,
}: {
  patientId?: string;
  role?: string;
  title?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("ai");
  const assistant = useAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const prompts = patientId
    ? [t("promptVisitsDoctor"), t("promptMedicinesDoctor"), t("promptFlagsDoctor")]
    : [t("promptMedicinesPatient"), t("promptLastVisit"), t("promptLabsPatient")];

  function ask(question: string) {
    const text = question.trim();
    if (!text || assistant.isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    assistant.mutate(
      { question: text, patientId },
      {
        onSuccess: (res) =>
          setMessages((m) => [
            ...m,
            { role: "assistant", content: res.answer, citations: res.citations },
          ]),
        onError: (e) =>
          setMessages((m) => [
            ...m,
            { role: "assistant", content: getErrorMessage(e), error: true },
          ]),
      },
    );
  }

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : ""}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" /> {title ?? t("aiAssistantTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                {patientId ? t("askAboutPatient") : t("askAboutRecords")}
              </p>
              <div className="flex flex-wrap gap-2">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => ask(p)}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-700"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[85%] items-start gap-2 ${
                  m.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : m.error
                        ? "border border-red-200 bg-red-50 text-red-800"
                        : "border border-gray-200 bg-gray-50 text-gray-800"
                  }`}
                >
                  {m.content}
                  {m.citations && (
                    <CitationList citations={m.citations} role={role} className="mt-2" />
                  )}
                </div>
              </div>
            </div>
          ))}

          {assistant.isPending && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Bot className="h-4 w-4 animate-pulse" /> {t("thinking")}
            </div>
          )}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={t("chatPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={assistant.isPending}
          />
          <Button type="submit" size="sm" disabled={assistant.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <AIDisclaimer />
      </CardContent>
    </Card>
  );
}

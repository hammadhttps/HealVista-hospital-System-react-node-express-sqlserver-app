import { useState } from "react";
import { Send, BookOpen, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useKbAsk } from "../../hooks/mutations/useAiMutations";
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
 * Hospital knowledge assistant — RAG over policies, FAQs, and guidelines. Staff-only
 * (the route is role-guarded); answers are cited back to the KB articles they come
 * from, and the assistant is a single turn per question, never a chain.
 */
export default function KbAssistant({ title }: { title?: string }) {
  const { t } = useTranslation("ai");
  const kb = useKbAsk();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  function ask(question: string) {
    const text = question.trim();
    if (!text || kb.isPending) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    kb.mutate(text, {
      onSuccess: (res) =>
        setMessages((m) => [
          ...m,
          { role: "assistant", content: res.answer, citations: res.citations },
        ]),
      onError: (e) =>
        setMessages((m) => [...m, { role: "assistant", content: getErrorMessage(e), error: true }]),
    });
  }

  const staffPrompts = [t("kbPromptPolicy"), t("kbPromptIncident"), t("kbPromptVisitingHours")];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> {title ?? t("kbAssistantTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">{t("kbAskHint")}</p>
              <div className="flex flex-wrap gap-2">
                {staffPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => ask(p)}
                    className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-teal-300 hover:text-teal-700"
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
                    m.role === "user" ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-teal-600 text-white"
                      : m.error
                        ? "border border-red-200 bg-red-50 text-red-800"
                        : "border border-gray-200 bg-gray-50 text-gray-800"
                  }`}
                >
                  {m.content}
                  {m.citations && <CitationList citations={m.citations} className="mt-2" />}
                </div>
              </div>
            </div>
          ))}

          {kb.isPending && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <BookOpen className="h-4 w-4 animate-pulse" /> {t("kbSearching")}
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
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            placeholder={t("kbPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={kb.isPending}
          />
          <Button type="submit" size="sm" disabled={kb.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>

        <AIDisclaimer />
      </CardContent>
    </Card>
  );
}

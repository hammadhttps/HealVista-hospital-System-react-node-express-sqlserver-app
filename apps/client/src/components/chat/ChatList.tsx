import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatThreads } from "../../hooks/queries/useChat";
import { useAuthStore } from "../../store/authStore";
import { ChatMessages } from "./ChatMessages";

export function ChatList({ initialThread }: { initialThread?: string }) {
  const { t } = useTranslation(["chat"]);
  const { data: threads, isLoading } = useChatThreads();
  const user = useAuthStore((s) => s.user);
  const [activeThread, setActiveThread] = useState<string | null>(initialThread ?? null);

  if (isLoading) {
    return <div className="p-4 text-gray-500">{t("chat:loading")}</div>;
  }

  if (activeThread) {
    return (
      <div className="h-full">
        <ChatMessages threadId={activeThread} onClose={() => setActiveThread(null)} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border h-full flex flex-col">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold">{t("chat:chats")}</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!threads || threads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{t("chat:noConversations")}</div>
        ) : (
          (threads as any[]).map((thread: any) => {
            // A thread is always a patient ↔ doctor conversation; show the side
            // the viewer is not on. Staff (admin/receptionist) are neither side,
            // so they see the patient, with the doctor in the subtitle.
            const other = thread.patient?.userId === user?.id ? thread.doctor : thread.patient;
            const name =
              other?.fullName ?? thread.doctor?.fullName ?? thread.patient?.fullName ?? "";
            const subtitle = thread.appointment?.appointmentNo
              ? thread.appointment.appointmentNo
              : thread.patient && thread.doctor
                ? `${thread.patient.fullName} · ${thread.doctor.fullName}`
                : "";
            return (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-sm">
                    {name[0] ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name || t("chat:chat")}</p>
                    <p className="text-xs text-gray-400 truncate">{subtitle}</p>
                    {thread.messages?.[0] && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {thread.messages[0].content}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

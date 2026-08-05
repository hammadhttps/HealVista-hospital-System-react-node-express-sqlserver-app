import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useCreateOrGetDirectThread } from "../../hooks/mutations/useChatMutations";
import { Button } from "../ui/button";

/**
 * "Message doctor" on a doctor card. Opens the direct patient↔doctor thread
 * (creating it the first time) and jumps into it. Only patients get the button;
 * staff read conversations from their own chat screen.
 */
export function MessageDoctorButton({ doctorId }: { doctorId: string }) {
  const { t } = useTranslation(["chat"]);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const mutation = useCreateOrGetDirectThread();

  if (role !== "PATIENT") return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    mutation.mutate(doctorId, {
      onSuccess: (thread: { id: string }) => navigate(`/chat?thread=${thread.id}`),
      onError: () => toast.error(t("chat:startFailed")),
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={mutation.isPending}
      className="gap-1.5"
    >
      <MessageSquare className="h-4 w-4" />
      {mutation.isPending ? t("chat:starting") : t("chat:messageDoctor")}
    </Button>
  );
}

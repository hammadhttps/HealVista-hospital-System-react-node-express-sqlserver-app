import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueue } from "../hooks/queries/useAppointments";
import { useCallNextPatient } from "../hooks/mutations/useAppointmentMutations";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { format } from "date-fns";

const statusColor: Record<string, string> = {
  waiting: "default",
  called: "warning",
  served: "success",
  skipped: "destructive",
};

export default function LiveQueue() {
  const { t } = useTranslation(["nav", "queue"]);
  const { doctorId } = useParams<{ doctorId: string }>();
  const [date] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: tokens, isLoading } = useQueue(doctorId ?? "", date);
  const callNext = useCallNextPatient();

  const queueTokens = Array.isArray(tokens) ? tokens : [];

  const handleCallNext = () => {
    if (doctorId) callNext.mutate(doctorId);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t("nav:liveQueue")}</h1>
        <div className="flex gap-2">
          {doctorId && (
            <Button
              variant="outline"
              onClick={() => window.open(`/queue/display/${doctorId}`, "_blank", "noopener")}
            >
              {t("queue:waitingRoomScreen")}
            </Button>
          )}
          <Button onClick={handleCallNext} disabled={callNext.isPending}>
            {callNext.isPending ? t("queue:calling") : t("queue:callNext")}
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-64" />}

      {!isLoading && queueTokens.length === 0 && (
        <EmptyState title={t("queue:emptyTitle")} description={t("queue:emptyDescription")} />
      )}

      {!isLoading && queueTokens.length > 0 && (
        <div className="space-y-3">
          {queueTokens.map((token: any) => (
            <Card key={token.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <span className="text-2xl font-bold mr-4">#{token.tokenNumber}</span>
                  <span>{token.appointment?.patient?.fullName ?? t("queue:walkIn")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColor[token.status] as any}>{token.status}</Badge>
                  {token.appointment?.id && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link to={`/consultation/${token.appointment.id}`} />}
                      >
                        {t("queue:consult")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link to={`/prescriptions/${token.appointment.id}`} />}
                      >
                        {t("queue:prescribe")}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

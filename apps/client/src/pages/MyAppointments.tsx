import { useState } from "react";
import { useMyAppointments } from "../hooks/queries/useAppointments";
import { useCancelAppointment, useCheckIn } from "../hooks/mutations/useAppointmentMutations";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { AppointmentQR } from "../components/appointments/AppointmentQR";
import { toast } from "sonner";
import { format } from "date-fns";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "CONFIRMED", label: "Upcoming" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const statusColor: Record<string, string> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "default",
  CHECKED_IN: "info",
  IN_CONSULTATION: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

export default function MyAppointments() {
  const [tab, setTab] = useState("");
  const cancelMutation = useCancelAppointment();
  const checkInMutation = useCheckIn();

  const filters: Record<string, unknown> = {};
  if (tab) filters.status = tab;

  const { data, isLoading } = useMyAppointments(filters);
  const appointments = data?.data ?? data ?? [];
  const meta = data?.meta;

  const handleCancel = (id: string) => {
    const reason = prompt("Reason for cancellation:");
    if (!reason) return;
    cancelMutation.mutate(
      { id, reason },
      { onSuccess: () => toast.success("Appointment cancelled") },
    );
  };

  const handleCheckIn = (qrToken: string) => {
    checkInMutation.mutate(qrToken, {
      onSuccess: () => toast.success("Checked in!"),
      onError: (err: any) => toast.error(err?.message || "Check-in failed"),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Appointments</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {isLoading && (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            )}

            {!isLoading && appointments.length === 0 && (
              <EmptyState
                title="No appointments"
                description="Book your first appointment to get started."
              />
            )}

            {!isLoading && appointments.length > 0 && (
              <div className="space-y-4">
                {appointments.map((apt: any) => (
                  <Card key={apt.id}>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg">Dr. {apt.doctor?.fullName}</CardTitle>
                      <Badge variant={statusColor[apt.status] as any}>{apt.status}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Appointment #{apt.appointmentNo}
                      </p>
                      {apt.slot && (
                        <p className="text-sm">
                          {format(new Date(apt.slot.startTime), "MMM dd, yyyy HH:mm")}
                        </p>
                      )}
                      <p className="text-sm">{apt.reasonNote}</p>
                      <div className="flex gap-2 pt-2">
                        {apt.status === "CONFIRMED" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleCheckIn(apt.qrToken)}
                              disabled={checkInMutation.isPending}
                            >
                              Check In
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancel(apt.id)}
                              disabled={cancelMutation.isPending}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {apt.qrToken && (apt.status === "CONFIRMED" || apt.status === "CHECKED_IN") && (
                          <AppointmentQR qrToken={apt.qrToken} appointmentNo={apt.appointmentNo} />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

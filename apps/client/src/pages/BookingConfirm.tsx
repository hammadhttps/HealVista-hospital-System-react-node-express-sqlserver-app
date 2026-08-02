import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingStore } from "../store/bookingStore";
import { useBookAppointment } from "../hooks/mutations/useAppointmentMutations";
import { useDoctorAvailability } from "../hooks/queries/useAppointments";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";

export default function BookingConfirm() {
  const { t } = useTranslation(["common", "booking"]);
  const navigate = useNavigate();
  const { selection, reset } = useBookingStore();
  const bookMutation = useBookAppointment();

  const { data: availability } = useDoctorAvailability(selection.doctorId ?? "");

  const handleConfirm = async () => {
    if (!selection.doctorId || !selection.slotId) {
      toast.error(t("booking:missingInfo"));
      return;
    }

    bookMutation.mutate(
      {
        doctorId: selection.doctorId,
        slotId: selection.slotId,
        reasonNote: selection.reasonNote ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("booking:booked"));
          reset();
          navigate("/patient/appointments");
        },
        onError: (err: any) => {
          toast.error(err?.message || t("booking:failed"));
        },
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t("booking:title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("booking:summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            {t("booking:doctor")} {selection.doctorId}
          </p>
          <p>
            {t("booking:date")} {selection.date}
          </p>
          <p>
            {t("booking:reason")} {selection.reasonNote || t("booking:notSpecified")}
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t("common:back")}
        </Button>
        <Button onClick={handleConfirm} disabled={bookMutation.isPending}>
          {bookMutation.isPending ? t("booking:booking") : t("booking:title")}
        </Button>
      </div>
    </div>
  );
}

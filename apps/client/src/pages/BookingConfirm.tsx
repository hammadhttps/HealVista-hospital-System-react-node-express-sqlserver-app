import { useNavigate } from "react-router-dom";
import { useBookingStore } from "../store/bookingStore";
import { useBookAppointment } from "../hooks/mutations/useAppointmentMutations";
import { useDoctorAvailability } from "../hooks/queries/useAppointments";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";

export default function BookingConfirm() {
  const navigate = useNavigate();
  const { selection, reset } = useBookingStore();
  const bookMutation = useBookAppointment();

  const { data: availability } = useDoctorAvailability(selection.doctorId ?? "");

  const handleConfirm = async () => {
    if (!selection.doctorId || !selection.slotId) {
      toast.error("Missing booking information");
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
          toast.success("Appointment booked!");
          reset();
          navigate("/patient/appointments");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Booking failed");
        },
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Confirm Booking</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appointment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>Doctor: {selection.doctorId}</p>
          <p>Date: {selection.date}</p>
          <p>Reason: {selection.reasonNote || "Not specified"}</p>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Button onClick={handleConfirm} disabled={bookMutation.isPending}>
          {bookMutation.isPending ? "Booking..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
  );
}

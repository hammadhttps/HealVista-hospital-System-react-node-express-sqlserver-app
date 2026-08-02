import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { doctorSearchApi, doctorAvailabilityApi } from "../api/appointments";
import { useBookingStore } from "../store/bookingStore";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { format } from "date-fns";

export default function DoctorProfile() {
  const { t } = useTranslation(["common", "doctors"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const setDoctor = useBookingStore((s) => s.setDoctor);
  const setSlot = useBookingStore((s) => s.setSlot);
  const setStep = useBookingStore((s) => s.setStep);

  const { data: doctor, isLoading } = useQuery({
    queryKey: ["doctors", id],
    queryFn: () => doctorSearchApi.getById(id!),
    enabled: !!id,
  });

  const { data: slots } = useQuery({
    queryKey: ["doctors", id, "slots", selectedDate],
    queryFn: () => doctorAvailabilityApi.getSlots(id!, selectedDate),
    enabled: !!id && !!selectedDate,
    refetchInterval: 30_000,
  });

  const availableSlots = Array.isArray(slots)
    ? slots.filter((s: any) => !s.isBooked && !s.isBlocked)
    : [];

  const handleBook = (slotId: string) => {
    if (!id) return;
    setDoctor(id);
    setSlot(slotId, Date.now() + 300000);
    setStep("confirm");
    navigate("/booking/confirm");
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (!doctor)
    return <EmptyState title={t("doctors:notFound")} description={t("doctors:notFoundHint")} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{doctor.fullName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{doctor.bio}</p>
          <div className="flex flex-wrap gap-2">
            {doctor.departments?.map((dd: any) => (
              <Badge key={dd.department.id}>{dd.department.name}</Badge>
            ))}
          </div>
          <p>{t("doctors:fee", { amount: Number(doctor.consultationFee).toFixed(2) })}</p>
          <p>{t("doctors:yearsExperience", { years: doctor.experienceYears })}</p>
          {doctor.qualifications?.length > 0 && (
            <div>
              <h3 className="font-semibold">{t("doctors:qualifications")}</h3>
              <ul className="list-disc list-inside">
                {doctor.qualifications.map((q: string, i: number) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">{t("doctors:availableSlots")}</h2>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border rounded p-2 mb-4"
          min={format(new Date(), "yyyy-MM-dd")}
        />

        {availableSlots.length === 0 ? (
          <EmptyState title={t("doctors:noSlots")} description={t("doctors:noSlotsHint")} />
        ) : (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {availableSlots.map((slot: any) => (
              <Button key={slot.id} variant="outline" onClick={() => handleBook(slot.id)}>
                {format(new Date(slot.startTime), "HH:mm")} -{" "}
                {format(new Date(slot.endTime), "HH:mm")}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

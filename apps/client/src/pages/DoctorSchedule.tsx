import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { useDoctorAvailability, useDoctorExceptions } from "../hooks/queries/useAppointments";
import {
  useUpdateAvailability,
  useCreateException,
  useDeleteException,
  useGenerateSlots,
} from "../hooks/mutations/useAppointmentMutations";
import { useQuery } from "@tanstack/react-query";
import { doctorSearchApi } from "../api/appointments";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../components/ui/select";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { toast } from "sonner";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DoctorSchedule() {
  const { t } = useTranslation(["common", "nav", "schedule"]);
  const dayLabels = [
    t("schedule:daySunday"),
    t("schedule:dayMonday"),
    t("schedule:dayTuesday"),
    t("schedule:dayWednesday"),
    t("schedule:dayThursday"),
    t("schedule:dayFriday"),
    t("schedule:daySaturday"),
  ];
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? "";
  const { data: profile } = useQuery({
    queryKey: ["my-doctor-profile", userId],
    queryFn: () => doctorSearchApi.getById(userId),
    enabled: !!userId,
  });

  const doctorId = profile?.doctor?.id ?? profile?.id ?? "";
  const { data: availability, isLoading: loadingAvail } = useDoctorAvailability(doctorId);
  const { data: exceptions } = useDoctorExceptions(doctorId);
  const updateAvail = useUpdateAvailability();
  const createException = useCreateException();
  const deleteException = useDeleteException();
  const generateSlots = useGenerateSlots();

  const [entries, setEntries] = useState<any[]>([]);
  const [newEntry, setNewEntry] = useState({
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    slotDurationMins: 30,
  });

  const handleSave = async () => {
    updateAvail.mutate(
      { doctorId, entries: entries.length > 0 ? entries : (availability ?? []) },
      {
        onSuccess: () => toast.success(t("schedule:availabilitySaved")),
        onError: (err: any) => toast.error(err?.message || t("schedule:saveFailed")),
      },
    );
  };

  const handleGenerateSlots = () => {
    generateSlots.mutate(doctorId, {
      onSuccess: () => toast.success(t("schedule:slotsGenerated")),
      onError: (err: any) => toast.error(err?.message || t("schedule:generationFailed")),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("nav:mySchedule")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("schedule:weeklyAvailability")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-sm">{t("schedule:day")}</label>
              <Select
                value={String(newEntry.dayOfWeek)}
                onValueChange={(v) => setNewEntry({ ...newEntry, dayOfWeek: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((day, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {dayLabels[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm">{t("schedule:start")}</label>
              <Input
                type="time"
                value={newEntry.startTime}
                onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">{t("schedule:end")}</label>
              <Input
                type="time"
                value={newEntry.endTime}
                onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">{t("schedule:durationMin")}</label>
              <Input
                type="number"
                value={newEntry.slotDurationMins}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, slotDurationMins: Number(e.target.value) })
                }
                className="w-20"
              />
            </div>
            <Button
              onClick={() => {
                setEntries([...entries, newEntry]);
                setNewEntry({
                  dayOfWeek: 1,
                  startTime: "09:00",
                  endTime: "17:00",
                  slotDurationMins: 30,
                });
              }}
            >
              {t("schedule:add")}
            </Button>
          </div>

          {loadingAvail && <Skeleton className="h-32" />}

          {!loadingAvail && availability && (
            <div className="space-y-2">
              {availability.map((a: any) => (
                <div key={a.id} className="flex justify-between items-center p-2 bg-muted rounded">
                  <span>
                    {t("schedule:availabilityRow", {
                      day: dayLabels[a.dayOfWeek],
                      start: a.startTime,
                      end: a.endTime,
                      minutes: a.slotDurationMins,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Button onClick={handleSave} disabled={updateAvail.isPending}>
            {updateAvail.isPending ? t("common:saving") : t("schedule:saveAvailability")}
          </Button>
          <Button
            variant="outline"
            onClick={handleGenerateSlots}
            disabled={generateSlots.isPending}
            className="ml-2"
          >
            {generateSlots.isPending ? t("schedule:generating") : t("schedule:generateSlots")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("schedule:exceptions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!exceptions || exceptions.length === 0 ? (
            <EmptyState
              title={t("schedule:noExceptions")}
              description={t("schedule:noExceptionsHint")}
            />
          ) : (
            exceptions.map((ex: any) => (
              <div key={ex.id} className="flex justify-between items-center p-2 bg-muted rounded">
                <span>
                  {t("schedule:exceptionRow", {
                    type: ex.type,
                    start: new Date(ex.startDate).toLocaleDateString(),
                    end: new Date(ex.endDate).toLocaleDateString(),
                  })}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteException.mutate({ doctorId, exceptionId: ex.id })}
                >
                  {t("common:delete")}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

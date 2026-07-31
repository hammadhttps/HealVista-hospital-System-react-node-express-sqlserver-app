import { useState } from "react";
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
        onSuccess: () => toast.success("Availability saved"),
        onError: (err: any) => toast.error(err?.message || "Failed to save"),
      },
    );
  };

  const handleGenerateSlots = () => {
    generateSlots.mutate(doctorId, {
      onSuccess: () => toast.success("Slots generated"),
      onError: (err: any) => toast.error(err?.message || "Generation failed"),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Schedule</h1>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-sm">Day</label>
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
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm">Start</label>
              <Input
                type="time"
                value={newEntry.startTime}
                onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">End</label>
              <Input
                type="time"
                value={newEntry.endTime}
                onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm">Duration (min)</label>
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
              Add
            </Button>
          </div>

          {loadingAvail && <Skeleton className="h-32" />}

          {!loadingAvail && availability && (
            <div className="space-y-2">
              {availability.map((a: any) => (
                <div key={a.id} className="flex justify-between items-center p-2 bg-muted rounded">
                  <span>
                    {DAYS[a.dayOfWeek]}: {a.startTime}-{a.endTime} ({a.slotDurationMins}min)
                  </span>
                </div>
              ))}
            </div>
          )}

          <Button onClick={handleSave} disabled={updateAvail.isPending}>
            {updateAvail.isPending ? "Saving..." : "Save Availability"}
          </Button>
          <Button
            variant="outline"
            onClick={handleGenerateSlots}
            disabled={generateSlots.isPending}
            className="ml-2"
          >
            {generateSlots.isPending ? "Generating..." : "Generate Slots"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exceptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!exceptions || exceptions.length === 0 ? (
            <EmptyState title="No exceptions" description="Add time-off or surgery days." />
          ) : (
            exceptions.map((ex: any) => (
              <div key={ex.id} className="flex justify-between items-center p-2 bg-muted rounded">
                <span>
                  {ex.type}: {new Date(ex.startDate).toLocaleDateString()} -{" "}
                  {new Date(ex.endDate).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteException.mutate({ doctorId, exceptionId: ex.id })}
                >
                  Delete
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

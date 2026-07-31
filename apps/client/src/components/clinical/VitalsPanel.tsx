import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { vitalsInputSchema } from "@healvista/shared";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../primitives/EmptyState";
import { useLatestVitals, useVitals } from "../../hooks/queries/useClinical";
import { useRecordVitals } from "../../hooks/mutations/useClinicalMutations";
import { useAuthStore } from "../../store/authStore";

export const VITAL_META: Record<string, { label: string; unit: string }> = {
  height_cm: { label: "Height", unit: "cm" },
  weight_kg: { label: "Weight", unit: "kg" },
  systolic_bp: { label: "Systolic BP", unit: "mmHg" },
  diastolic_bp: { label: "Diastolic BP", unit: "mmHg" },
  heart_rate: { label: "Heart rate", unit: "bpm" },
  temperature_c: { label: "Temperature", unit: "°C" },
  spo2: { label: "SpO₂", unit: "%" },
  blood_glucose: { label: "Blood glucose", unit: "mg/dL" },
  respiratory_rate: { label: "Respiratory rate", unit: "breaths/min" },
};

interface VitalRow {
  type: string;
  value: number;
  unit: string;
  recordedAt: string;
  flag?: "LOW" | "NORMAL" | "HIGH";
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

function flagTone(flag?: string) {
  if (flag === "HIGH" || flag === "LOW") return "warning";
  return "outline";
}

export function LatestVitalsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useLatestVitals(patientId);

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-4 text-sm text-gray-500">Loading latest vitals…</CardContent>
      </Card>
    );
  if (!data || data.vitals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest vitals</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState title="No vitals recorded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Latest vitals
          {data.bmi && (
            <Badge variant="outline">
              BMI {data.bmi.value} · {data.bmi.category}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(data.vitals as VitalRow[]).map((v) => (
          <div key={v.type} className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{VITAL_META[v.type]?.label ?? v.type}</span>
              <Badge variant={flagTone(v.flag) as "warning" | "outline"} className="text-[10px]">
                {v.flag}
              </Badge>
            </div>
            <div className="mt-1 text-lg font-semibold">
              {v.value}
              <span className="ml-1 text-xs font-normal text-gray-500">{v.unit}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function VitalsEntryForm({
  patientId,
  appointmentId,
}: {
  patientId: string;
  appointmentId?: string;
}) {
  const mutation = useRecordVitals(patientId);
  const canWrite = useAuthStore((s) => s.user?.role);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof vitalsInputSchema>>({ resolver: zodResolver(vitalsInputSchema) });

  if (canWrite !== "DOCTOR" && canWrite !== "ADMIN" && canWrite !== "PATIENT") return null;

  const types = Object.keys(VITAL_META);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record vitals</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          onSubmit={handleSubmit((values) => {
            const readings = values.readings
              .filter((r) => r.type && r.value !== undefined && Number.isFinite(Number(r.value)))
              .map((r) => ({ type: r.type, value: Number(r.value) }));
            if (readings.length === 0) {
              toast.error("Enter at least one reading");
              return;
            }
            mutation.mutate(
              { readings, appointmentId },
              {
                onSuccess: () => {
                  toast.success("Vitals recorded");
                  reset({ readings: [] });
                },
                onError: (e) => toast.error(e.message),
              },
            );
          })}
        >
          {errors.readings && (
            <p className="col-span-full text-xs text-red-600">{errors.readings.message}</p>
          )}
          {types.map((t, i) => (
            <div key={t} className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-gray-600">
                {VITAL_META[t].label} ({VITAL_META[t].unit})
              </label>
              <input
                type="number"
                step="any"
                className={inputCls}
                placeholder="—"
                {...register(`readings.${i}.value`, { valueAsNumber: true })}
              />
              <input type="hidden" value={t} {...register(`readings.${i}.type`)} />
            </div>
          ))}
          <div className="col-span-full">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save readings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VitalsChart({ patientId }: { patientId: string }) {
  const [type, setType] = useState<string>("heart_rate");
  const { data, isLoading } = useVitals(patientId, { type });

  const rows = (data ?? []) as VitalRow[];
  const chartData = rows.slice(-60).map((r) => ({
    time: new Date(r.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: r.value,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Trend
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {Object.keys(VITAL_META).map((t) => (
              <option key={t} value={t}>
                {VITAL_META[t].label}
              </option>
            ))}
          </select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : chartData.length < 2 ? (
          <EmptyState title="Not enough readings to chart yet" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function VitalsPanel({
  patientId,
  appointmentId,
}: {
  patientId: string;
  appointmentId?: string;
}) {
  return (
    <div className="space-y-4">
      <LatestVitalsCard patientId={patientId} />
      <VitalsEntryForm patientId={patientId} appointmentId={appointmentId} />
      <VitalsChart patientId={patientId} />
    </div>
  );
}

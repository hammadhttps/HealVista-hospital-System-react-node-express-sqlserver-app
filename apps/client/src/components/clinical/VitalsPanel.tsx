import { useState } from "react";
import { useTranslation } from "react-i18next";
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

export const VITAL_META: Record<string, { labelKey: string; unit: string }> = {
  height_cm: { labelKey: "vitals:labelHeight", unit: "cm" },
  weight_kg: { labelKey: "vitals:labelWeight", unit: "kg" },
  systolic_bp: { labelKey: "vitals:labelSystolicBp", unit: "mmHg" },
  diastolic_bp: { labelKey: "vitals:labelDiastolicBp", unit: "mmHg" },
  heart_rate: { labelKey: "vitals:labelHeartRate", unit: "bpm" },
  temperature_c: { labelKey: "vitals:labelTemperature", unit: "°C" },
  spo2: { labelKey: "vitals:labelSpo2", unit: "%" },
  blood_glucose: { labelKey: "vitals:labelBloodGlucose", unit: "mg/dL" },
  respiratory_rate: { labelKey: "vitals:labelRespiratoryRate", unit: "breaths/min" },
};

const FLAG_KEYS: Record<string, string> = {
  LOW: "vitals:flagLow",
  NORMAL: "vitals:flagNormal",
  HIGH: "vitals:flagHigh",
};

interface VitalRow {
  type: string;
  value: number;
  unit: string;
  recordedAt: string;
  flag?: "LOW" | "NORMAL" | "HIGH";
}

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none";

function flagTone(flag?: string) {
  if (flag === "HIGH" || flag === "LOW") return "warning";
  return "outline";
}

export function LatestVitalsCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["vitals", "common"]);
  const { data, isLoading } = useLatestVitals(patientId);

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-4 text-sm text-gray-500">{t("vitals:loadingLatest")}</CardContent>
      </Card>
    );
  if (!data || data.vitals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("vitals:latestVitals")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState title={t("vitals:noVitalsRecorded")} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {t("vitals:latestVitals")}
          {data.bmi && (
            <Badge variant="outline">
              {t("vitals:bmiValue", { value: data.bmi.value, category: data.bmi.category })}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(data.vitals as VitalRow[]).map((v) => (
          <div key={v.type} className="rounded-md border border-gray-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">
                {VITAL_META[v.type] ? t(VITAL_META[v.type].labelKey) : v.type}
              </span>
              <Badge variant={flagTone(v.flag) as "warning" | "outline"} className="text-[10px]">
                {v.flag ? t(FLAG_KEYS[v.flag] ?? v.flag) : ""}
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
  const { t } = useTranslation(["vitals", "common"]);
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
        <CardTitle className="text-base">{t("vitals:recordVitals")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          onSubmit={handleSubmit((values) => {
            const readings = values.readings
              .filter((r) => r.type && r.value !== undefined && Number.isFinite(Number(r.value)))
              .map((r) => ({ type: r.type, value: Number(r.value) }));
            if (readings.length === 0) {
              toast.error(t("vitals:atLeastOneReading"));
              return;
            }
            mutation.mutate(
              { readings, appointmentId },
              {
                onSuccess: () => {
                  toast.success(t("vitals:recordedToast"));
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
          {types.map((k, i) => (
            <div key={k} className="flex flex-col">
              <label className="mb-1 text-xs font-medium text-gray-600">
                {t(VITAL_META[k].labelKey)} ({VITAL_META[k].unit})
              </label>
              <input
                type="number"
                step="any"
                className={inputCls}
                placeholder="—"
                {...register(`readings.${i}.value`, { valueAsNumber: true })}
              />
              <input type="hidden" value={k} {...register(`readings.${i}.type`)} />
            </div>
          ))}
          <div className="col-span-full">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("common:saving") : t("vitals:saveReadings")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VitalsChart({ patientId }: { patientId: string }) {
  const { t } = useTranslation(["vitals", "common"]);
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
          {t("vitals:trend")}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {Object.keys(VITAL_META).map((k) => (
              <option key={k} value={k}>
                {t(VITAL_META[k].labelKey)}
              </option>
            ))}
          </select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <EmptyState title={t("common:loading")} />
        ) : chartData.length < 2 ? (
          <EmptyState title={t("vitals:notEnoughReadings")} />
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

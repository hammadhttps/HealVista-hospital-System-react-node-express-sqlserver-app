import { Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, assertClinicalWriteAccess, type Actor } from "./access.service.js";

const D = Prisma.Decimal;

export const VITAL_TYPES = [
  "height_cm",
  "weight_kg",
  "systolic_bp",
  "diastolic_bp",
  "heart_rate",
  "temperature_c",
  "spo2",
  "blood_glucose",
  "respiratory_rate",
] as const;

export type VitalType = (typeof VITAL_TYPES)[number];

export const VITAL_UNITS: Record<VitalType, string> = {
  height_cm: "cm",
  weight_kg: "kg",
  systolic_bp: "mmHg",
  diastolic_bp: "mmHg",
  heart_rate: "bpm",
  temperature_c: "°C",
  spo2: "%",
  blood_glucose: "mg/dL",
  respiratory_rate: "breaths/min",
};

interface Range {
  low: number;
  high: number;
}

/**
 * Reference bands. Adult values unless an age-specific band applies — a heart rate
 * of 120 is an emergency in an adult and unremarkable in an infant, so flagging
 * against adult bands alone produces alarms clinicians learn to ignore.
 */
function referenceRange(type: string, ageYears: number | null): Range | null {
  const adult: Partial<Record<string, Range>> = {
    systolic_bp: { low: 90, high: 120 },
    diastolic_bp: { low: 60, high: 80 },
    heart_rate: { low: 60, high: 100 },
    temperature_c: { low: 36.1, high: 37.5 },
    spo2: { low: 95, high: 100 },
    blood_glucose: { low: 70, high: 140 },
    respiratory_rate: { low: 12, high: 20 },
  };

  if (ageYears === null) return adult[type] ?? null;

  if (ageYears < 1) {
    const infant: Partial<Record<string, Range>> = {
      heart_rate: { low: 100, high: 160 },
      respiratory_rate: { low: 30, high: 60 },
      systolic_bp: { low: 65, high: 85 },
      diastolic_bp: { low: 45, high: 55 },
    };
    return infant[type] ?? adult[type] ?? null;
  }

  if (ageYears < 12) {
    const child: Partial<Record<string, Range>> = {
      heart_rate: { low: 70, high: 120 },
      respiratory_rate: { low: 18, high: 30 },
      systolic_bp: { low: 90, high: 110 },
      diastolic_bp: { low: 55, high: 75 },
    };
    return child[type] ?? adult[type] ?? null;
  }

  return adult[type] ?? null;
}

export type VitalFlag = "LOW" | "NORMAL" | "HIGH";

export function flagValue(type: string, value: number, ageYears: number | null): VitalFlag {
  const range = referenceRange(type, ageYears);
  if (!range) return "NORMAL";
  if (value < range.low) return "LOW";
  if (value > range.high) return "HIGH";
  return "NORMAL";
}

function ageInYears(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const ms = Date.now() - dateOfBirth.getTime();
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * BMI is **derived, never stored**. Storing it guarantees it will one day disagree
 * with the height and weight it came from.
 */
export function computeBmi(heightCm: number, weightKg: number): number | null {
  if (heightCm <= 0 || weightKg <= 0) return null;
  const metres = heightCm / 100;
  return Number((weightKg / (metres * metres)).toFixed(1));
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export async function recordVitals(
  patientId: string,
  readings: { type: string; value: number; recordedAt?: string }[],
  actor: Actor,
  appointmentId?: string,
) {
  await assertClinicalWriteAccess(patientId, actor);

  for (const r of readings) {
    if (!VITAL_TYPES.includes(r.type as VitalType)) {
      throw new AppError(`Unknown vital type: ${r.type}`, 400);
    }
    if (!Number.isFinite(r.value)) {
      throw new AppError(`Invalid value for ${r.type}`, 400);
    }
  }

  const created = await prisma.vitalReading.createManyAndReturn({
    data: readings.map((r) => ({
      patientId,
      appointmentId: appointmentId ?? null,
      recordedByUserId: actor.userId,
      type: r.type,
      value: new D(r.value),
      unit: VITAL_UNITS[r.type as VitalType],
      recordedAt: r.recordedAt ? new Date(r.recordedAt) : new Date(),
    })),
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "VITALS_RECORDED",
    targetType: "patient",
    targetId: patientId,
    metadata: { types: readings.map((r) => r.type), appointmentId: appointmentId ?? null },
  });

  return created;
}

export async function getVitals(
  patientId: string,
  filters: { type?: string; from?: string; to?: string },
  actor: Actor,
) {
  await assertClinicalAccess(patientId, actor);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dateOfBirth: true },
  });
  const age = ageInYears(patient?.dateOfBirth ?? null);

  const where: Prisma.VitalReadingWhereInput = { patientId };
  if (filters.type) where.type = filters.type;
  if (filters.from || filters.to) {
    where.recordedAt = {};
    if (filters.from) where.recordedAt.gte = new Date(filters.from);
    if (filters.to) where.recordedAt.lte = new Date(filters.to);
  }

  const readings = await prisma.vitalReading.findMany({
    where,
    orderBy: { recordedAt: "asc" },
  });

  return readings.map((r) => ({
    ...r,
    flag: flagValue(r.type, Number(r.value), age),
  }));
}

/**
 * The latest value of each vital, plus derived BMI — the card a doctor sees at the
 * top of a patient view.
 */
export async function getLatestVitals(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { dateOfBirth: true },
  });
  const age = ageInYears(patient?.dateOfBirth ?? null);

  // One row per type, newest first.
  const readings = await prisma.vitalReading.findMany({
    where: { patientId },
    orderBy: { recordedAt: "desc" },
    distinct: ["type"],
  });

  const latest = readings.map((r) => ({
    type: r.type,
    value: Number(r.value),
    unit: r.unit,
    recordedAt: r.recordedAt,
    flag: flagValue(r.type, Number(r.value), age),
  }));

  const height = latest.find((v) => v.type === "height_cm")?.value;
  const weight = latest.find((v) => v.type === "weight_kg")?.value;
  const bmi = height && weight ? computeBmi(height, weight) : null;

  return {
    vitals: latest,
    bmi: bmi ? { value: bmi, category: bmiCategory(bmi) } : null,
    ageYears: age,
  };
}

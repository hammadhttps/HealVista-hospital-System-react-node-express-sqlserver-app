import { z } from "zod";

/**
 * Clinical-core schemas — medical history, vitals, consultation notes,
 * prescriptions, medical records, pharmacy, laboratory, referrals, dependants.
 * Shared so the client forms and the server routes validate against the same
 * shapes (CLAUDE.md §3 / §6).
 */

// ─── Medical history ─────────────────────────────────────────────────────────

export const allergySeverityEnum = z.enum(["MILD", "MODERATE", "SEVERE"]);

export const allergyInputSchema = z.object({
  allergen: z.string().min(1).max(200),
  severity: allergySeverityEnum,
  reaction: z.string().max(500).optional(),
});

export const conditionInputSchema = z.object({
  condition: z.string().min(1).max(300),
  diagnosedAt: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const vaccinationInputSchema = z.object({
  vaccineName: z.string().min(1).max(200),
  doseNumber: z.coerce.number().int().min(1).optional(),
  administeredAt: z.string(),
  administeredBy: z.string().max(200).optional(),
  batchNumber: z.string().max(120).optional(),
  nextDueAt: z.string().optional(),
});

export const surgeryInputSchema = z.object({
  procedure: z.string().min(1).max(300),
  performedAt: z.string().optional(),
  hospital: z.string().max(300).optional(),
  surgeon: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export const familyHistoryInputSchema = z.object({
  relationship: z.string().min(1).max(100),
  condition: z.string().min(1).max(300),
  notes: z.string().max(1000).optional(),
});

export const lifestyleInputSchema = z.object({
  smokingStatus: z.string().max(200).optional(),
  alcoholUse: z.string().max(200).optional(),
  exerciseFreq: z.string().max(200).optional(),
  dietNotes: z.string().max(1000).optional(),
});

// ─── Vitals ──────────────────────────────────────────────────────────────────

export const vitalsInputSchema = z.object({
  readings: z
    .array(
      z.object({
        type: z.string().min(1).max(40),
        value: z.coerce.number().finite(),
      }),
    )
    .min(1),
  appointmentId: z.string().uuid().optional(),
});

export const vitalsQuerySchema = z.object({
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ─── Consultation notes ──────────────────────────────────────────────────────

export const noteInputSchema = z.object({
  subjective: z.string().max(4000),
  objective: z.string().max(4000),
  assessment: z.string().max(4000),
  plan: z.string().max(4000),
  diagnosisCodes: z.array(z.string().max(20)).optional(),
  isDraft: z.boolean().optional(),
  // True when the content started life as an AI SOAP draft the doctor edited.
  // The server enforces that an AI draft was actually modified before it can be
  // saved verbatim (see soapDraft.store).
  aiAssisted: z.boolean().optional(),
});

export const noteTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subjective: z.string().max(4000).optional(),
  objective: z.string().max(4000).optional(),
  assessment: z.string().max(4000).optional(),
  plan: z.string().max(4000).optional(),
});

export const addendumInputSchema = z.object({
  content: z.string().min(1).max(4000),
});

// ─── Prescriptions & safety ──────────────────────────────────────────────────

export const prescriptionItemInputSchema = z.object({
  medicineId: z.string().uuid().optional(),
  medicineName: z.string().min(1).max(300),
  dosage: z.string().min(1).max(200),
  frequency: z.string().min(1).max(200),
  durationDays: z.coerce.number().int().min(1).max(365),
  instructions: z.string().max(1000).optional(),
  quantityPrescribed: z.coerce.number().int().min(1).max(10000).optional(),
});

export const prescriptionCheckSchema = z.object({
  appointmentId: z.string().uuid(),
  medicines: z.array(z.string().min(1).max(300)).min(1),
});

export const createPrescriptionSchema = z.object({
  appointmentId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  isDraft: z.boolean().optional(),
  followUpAfterDays: z.coerce.number().int().min(1).max(365).optional(),
  items: z.array(prescriptionItemInputSchema).min(1),
});

/** Autosave — the appointment already owns one prescription, so a draft is
 * updated in place (the column is `@unique` on `appointmentId`). */
export const updatePrescriptionSchema = z.object({
  notes: z.string().max(2000).optional(),
  followUpAfterDays: z.coerce.number().int().min(1).max(365).optional(),
  items: z.array(prescriptionItemInputSchema).min(1),
});

export const issuePrescriptionSchema = z.object({
  acknowledgedWarnings: z.array(z.string()).default([]),
});

export const favouritePrescriptionSchema = z.object({
  name: z.string().min(1).max(200),
  items: z.array(prescriptionItemInputSchema).min(1),
});

// ─── Medical records ─────────────────────────────────────────────────────────

export const ALLOWED_RECORD_TYPES = ["pdf", "png", "jpeg"] as const;
export const MAX_RECORD_BYTES = 10 * 1024 * 1024; // 10 MB

export const uploadSignatureSchema = z.object({
  patientId: z.string().uuid(),
  fileType: z.enum(ALLOWED_RECORD_TYPES),
  fileSize: z.coerce.number().int().min(1).max(MAX_RECORD_BYTES),
});

export const registerRecordSchema = z.object({
  patientId: z.string().uuid(),
  publicId: z.string().min(1).max(300),
  title: z.string().min(1).max(300),
  fileType: z.enum(ALLOWED_RECORD_TYPES),
  category: z.string().max(100).optional(),
});

// ─── Pharmacy ────────────────────────────────────────────────────────────────

export const adjustStockSchema = z.object({
  medicineId: z.string().uuid(),
  changeAmount: z.coerce.number().int().min(1),
  reason: z.string().min(1).max(300),
  batchNumber: z.string().max(120).optional(),
  expiryDate: z.string().optional(),
});

export const dispenseSchema = z.object({
  lines: z
    .array(
      z.object({
        prescriptionItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        batchNumber: z.string().max(120).optional(),
      }),
    )
    .min(1),
});

export const recallSchema = z.object({
  medicineId: z.string().uuid(),
  batchNumber: z.string().min(1).max(120),
  reason: z.string().min(1).max(500),
});

export const medicinesQuerySchema = z.object({
  search: z.string().optional(),
  lowStockOnly: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Laboratory ──────────────────────────────────────────────────────────────

export const labOrderCreateSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  labTestIds: z.array(z.string().uuid()).min(1),
  notes: z.string().max(1000).optional(),
});

export const labResultsSchema = z.object({
  results: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        resultValue: z.string().min(1).max(500),
        unit: z.string().max(40).optional(),
        flag: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
      }),
    )
    .min(1),
});

export const labCancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const retestSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const labWorklistQuerySchema = z.object({
  status: z.enum(["ORDERED", "SAMPLE_COLLECTED", "TESTING", "COMPLETED", "VERIFIED"]).optional(),
});

// ─── Referrals & dependants ─────────────────────────────────────────────────

export const referralCreateSchema = z.object({
  patientId: z.string().uuid(),
  toDoctorId: z.string().uuid().optional(),
  toDepartmentId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  reason: z.string().min(1).max(1000),
  notes: z.string().max(2000).optional(),
});

export const referralRespondSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "COMPLETED"]),
});

export const dependentAddSchema = z.object({
  mrn: z.string().min(1).max(60),
  relationship: z.string().min(1).max(100),
  canViewRecords: z.boolean().default(true),
  canBookAppointments: z.boolean().default(true),
});

export const dependentUpdateSchema = z.object({
  relationship: z.string().min(1).max(100).optional(),
  canViewRecords: z.boolean().optional(),
  canBookAppointments: z.boolean().optional(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type AllergyInput = z.infer<typeof allergyInputSchema>;
export type ConditionInput = z.infer<typeof conditionInputSchema>;
export type VaccinationInput = z.infer<typeof vaccinationInputSchema>;
export type SurgeryInput = z.infer<typeof surgeryInputSchema>;
export type FamilyHistoryInput = z.infer<typeof familyHistoryInputSchema>;
export type LifestyleInput = z.infer<typeof lifestyleInputSchema>;
export type VitalsInput = z.infer<typeof vitalsInputSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type NoteTemplateInput = z.infer<typeof noteTemplateSchema>;
export type PrescriptionCheckInput = z.infer<typeof prescriptionCheckSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type IssuePrescriptionInput = z.infer<typeof issuePrescriptionSchema>;
export type FavouritePrescriptionInput = z.infer<typeof favouritePrescriptionSchema>;
export type UploadSignatureInput = z.infer<typeof uploadSignatureSchema>;
export type RegisterRecordInput = z.infer<typeof registerRecordSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type DispenseInput = z.infer<typeof dispenseSchema>;
export type RecallInput = z.infer<typeof recallSchema>;
export type LabOrderCreateInput = z.infer<typeof labOrderCreateSchema>;
export type LabResultsInput = z.infer<typeof labResultsSchema>;
export type ReferralCreateInput = z.infer<typeof referralCreateSchema>;
export type DependentAddInput = z.infer<typeof dependentAddSchema>;
export type DependentUpdateInput = z.infer<typeof dependentUpdateSchema>;

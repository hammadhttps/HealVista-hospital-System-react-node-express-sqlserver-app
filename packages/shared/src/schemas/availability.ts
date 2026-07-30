import { z } from "zod";

export const dayOfWeekSchema = z.number().int().min(0).max(6);

export const doctorAvailabilitySchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm format required"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm format required"),
  breakStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm format required")
    .optional()
    .nullable(),
  breakEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm format required")
    .optional()
    .nullable(),
  slotDurationMins: z.number().int().positive().default(30),
  isActive: z.boolean().default(true),
});

export const doctorAvailabilityArraySchema = z.array(doctorAvailabilitySchema);

export const availabilityExceptionSchema = z.object({
  type: z.enum(["LEAVE", "CONFERENCE", "SURGERY", "EMERGENCY", "OTHER"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional().nullable(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const rescheduleSchema = z.object({
  newSlotId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});

export const checkInSchema = z.object({
  qrToken: z.string().min(1),
});

export const appointmentQuerySchema = z.object({
  status: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  doctorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const bookAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  slotId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  reasonNote: z.string().max(500).optional(),
});

export const walkInBookingSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  slotId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  reasonNote: z.string().max(500).optional(),
});

export const generateSlotsSchema = z.object({
  doctorId: z.string().uuid().optional(),
});

export const symptomMatchSchema = z.object({
  symptom: z.string().min(1).max(500),
});

export type DoctorAvailabilityInput = z.infer<typeof doctorAvailabilitySchema>;
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type WalkInBookingInput = z.infer<typeof walkInBookingSchema>;
export type GenerateSlotsInput = z.infer<typeof generateSlotsSchema>;

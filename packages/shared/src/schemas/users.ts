import { z } from "zod";
import { ROLES } from "../constants.js";

export const profileUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  avatarUrl: z.string().url().optional(),
});

export const patientRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  bloodGroup: z.string().optional(),
  phone: z.string().max(20).optional(),
});

export const emergencyContactSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  isPrimary: z.boolean().default(false),
});

export const updatePatientSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  bloodGroup: z.string().optional(),
  maritalStatus: z.string().optional(),
  occupation: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  isOrganDonor: z.boolean().optional(),
});

export const staffUpdateSchema = z.object({
  departmentId: z.string().uuid().optional(),
  designation: z.string().optional(),
  status: z.string().optional(),
});

export const doctorUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  bio: z.string().optional(),
  licenseNumber: z.string().optional(),
  experienceYears: z.number().int().positive().optional(),
  consultationFee: z.number().positive().optional(),
  consultationMins: z.number().int().positive().optional(),
  languages: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
});

/**
 * Admin decision on the doctor verification queue. A rejection must carry a
 * reason — it is recorded in the audit log and shown to the doctor.
 */
export const doctorVerificationSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => v.status !== "REJECTED" || !!v.reason, {
    message: "A reason is required when rejecting a doctor",
    path: ["reason"],
  });

export const avatarUploadSchema = z.object({
  avatarUrl: z.string().url(),
});

/**
 * Admin creates a user account for any role. Role-specific fields are optional
 * and only applied when the chosen role uses them.
 */
export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(200),
  phone: z.string().max(20).optional(),
  role: z.enum(ROLES),
  departmentId: z.string().uuid().optional(),
  designation: z.string().max(100).optional(),
  licenseNumber: z.string().max(100).optional(),
  consultationFee: z.number().positive().optional(),
  consultationMins: z.number().int().positive().optional(),
  deskLocation: z.string().max(100).optional(),
  canVerify: z.boolean().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  bloodGroup: z.string().max(10).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
});

export const userListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  role: z.enum(ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PatientRegistrationInput = z.infer<typeof patientRegistrationSchema>;
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;
export type DoctorVerificationInput = z.infer<typeof doctorVerificationSchema>;
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type UserListQueryInput = z.infer<typeof userListQuerySchema>;

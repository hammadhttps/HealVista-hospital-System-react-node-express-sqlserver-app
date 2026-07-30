import { z } from "zod";

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

export const avatarUploadSchema = z.object({
  avatarUrl: z.string().url(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PatientRegistrationInput = z.infer<typeof patientRegistrationSchema>;
export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(200),
  role: z.enum(["PATIENT"]).default("PATIENT"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const resendVerifySchema = z.object({
  email: z.string().email(),
});

export const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1),
});

export const changePhoneSchema = z.object({
  newPhone: z.string().min(1).max(20),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  avatarUrl: z.string().url().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResendVerifyInput = z.infer<typeof resendVerifySchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePhoneInput = z.infer<typeof changePhoneSchema>;

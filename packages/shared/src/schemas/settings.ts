import { z } from "zod";

export const updateSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  logoUrl: z.string().url().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxPercentage: z.coerce.number().min(0).max(100).optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

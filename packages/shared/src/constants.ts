export const ROLES = [
  "PATIENT",
  "DOCTOR",
  "RECEPTIONIST",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "ACCOUNTANT",
  "ADMIN",
] as const;

export type Role = (typeof ROLES)[number];

export const DEPARTMENT_SLUGS = [
  "cardiology",
  "pediatrics",
  "orthopedics",
  "neurology",
  "dermatology",
  "ophthalmology",
  "ent",
  "gynecology",
  "psychiatry",
  "emergency",
  "general-medicine",
  "radiology",
] as const;

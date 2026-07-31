import { useQuery } from "@tanstack/react-query";
import {
  historyApi,
  vitalsApi,
  noteApi,
  prescriptionApi,
  dependentApi,
  referralApi,
} from "../../api/clinical";

export const historyKeys = {
  all: ["history"] as const,
  summary: (patientId: string) => ["history", patientId, "summary"] as const,
  allergies: (patientId: string) => ["history", patientId, "allergies"] as const,
  conditions: (patientId: string) => ["history", patientId, "conditions"] as const,
  vaccinations: (patientId: string) => ["history", patientId, "vaccinations"] as const,
  surgeries: (patientId: string) => ["history", patientId, "surgeries"] as const,
  lifestyle: (patientId: string) => ["history", patientId, "lifestyle"] as const,
};

export const vitalsKeys = {
  all: ["vitals"] as const,
  list: (patientId: string, filters?: Record<string, unknown>) =>
    ["vitals", patientId, "list", filters] as const,
  latest: (patientId: string) => ["vitals", patientId, "latest"] as const,
};

export const noteKeys = {
  all: ["notes"] as const,
  forAppointment: (appointmentId: string) => ["notes", "appointment", appointmentId] as const,
  previous: (appointmentId: string) => ["notes", "previous", appointmentId] as const,
  forPatient: (patientId: string) => ["notes", "patient", patientId] as const,
  templates: ["notes", "templates"] as const,
};

export const prescriptionKeys = {
  all: ["prescriptions"] as const,
  detail: (id: string) => ["prescriptions", id] as const,
  forPatient: (patientId: string) => ["prescriptions", "patient", patientId] as const,
  favourites: ["prescriptions", "favourites"] as const,
};

export const dependentKeys = {
  all: ["dependents"] as const,
  guardians: ["guardians"] as const,
};

export const referralKeys = {
  incoming: (status?: string) => ["referrals", "incoming", status] as const,
  outgoing: ["referrals", "outgoing"] as const,
  forPatient: (patientId: string) => ["referrals", "patient", patientId] as const,
};

// ─── History ────────────────────────────────────────────────────────────────

export function usePatientHistory(patientId: string) {
  return useQuery({
    queryKey: historyKeys.summary(patientId),
    queryFn: () => historyApi.summary(patientId),
    enabled: !!patientId,
  });
}

export function useAllergies(patientId: string) {
  return useQuery({
    queryKey: historyKeys.allergies(patientId),
    queryFn: () => historyApi.listAllergies(patientId),
    enabled: !!patientId,
  });
}

export function useConditions(patientId: string) {
  return useQuery({
    queryKey: historyKeys.conditions(patientId),
    queryFn: () => historyApi.listConditions(patientId),
    enabled: !!patientId,
  });
}

export function useVaccinations(patientId: string) {
  return useQuery({
    queryKey: historyKeys.vaccinations(patientId),
    queryFn: () => historyApi.listVaccinations(patientId),
    enabled: !!patientId,
  });
}

export function useSurgeries(patientId: string) {
  return useQuery({
    queryKey: historyKeys.surgeries(patientId),
    queryFn: () => historyApi.listSurgeries(patientId),
    enabled: !!patientId,
  });
}

export function useLifestyle(patientId: string) {
  return useQuery({
    queryKey: historyKeys.lifestyle(patientId),
    queryFn: () => historyApi.getLifestyle(patientId),
    enabled: !!patientId,
  });
}

// ─── Vitals ─────────────────────────────────────────────────────────────────

export function useVitals(patientId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: vitalsKeys.list(patientId, filters),
    queryFn: () => vitalsApi.list(patientId, filters),
    enabled: !!patientId,
  });
}

export function useLatestVitals(patientId: string) {
  return useQuery({
    queryKey: vitalsKeys.latest(patientId),
    queryFn: () => vitalsApi.latest(patientId),
    enabled: !!patientId,
  });
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export function useConsultationNote(appointmentId: string) {
  return useQuery({
    queryKey: noteKeys.forAppointment(appointmentId),
    queryFn: () => noteApi.get(appointmentId),
    enabled: !!appointmentId,
  });
}

export function usePreviousNote(appointmentId: string) {
  return useQuery({
    queryKey: noteKeys.previous(appointmentId),
    queryFn: () => noteApi.previous(appointmentId),
    enabled: !!appointmentId,
  });
}

export function usePatientNotes(patientId: string) {
  return useQuery({
    queryKey: noteKeys.forPatient(patientId),
    queryFn: () => noteApi.listForPatient(patientId),
    enabled: !!patientId,
  });
}

export function useNoteTemplates() {
  return useQuery({ queryKey: noteKeys.templates, queryFn: () => noteApi.listTemplates() });
}

// ─── Prescriptions ──────────────────────────────────────────────────────────

export function usePrescription(id: string) {
  return useQuery({
    queryKey: prescriptionKeys.detail(id),
    queryFn: () => prescriptionApi.getById(id),
    enabled: !!id,
  });
}

export function usePatientPrescriptions(patientId: string) {
  return useQuery({
    queryKey: prescriptionKeys.forPatient(patientId),
    queryFn: () => prescriptionApi.listForPatient(patientId),
    enabled: !!patientId,
  });
}

export function useFavouritePrescriptions() {
  return useQuery({
    queryKey: prescriptionKeys.favourites,
    queryFn: () => prescriptionApi.listFavourites(),
  });
}

// ─── Dependants ─────────────────────────────────────────────────────────────

export function useDependents() {
  return useQuery({ queryKey: dependentKeys.all, queryFn: () => dependentApi.list() });
}

export function useGuardians() {
  return useQuery({
    queryKey: dependentKeys.guardians,
    queryFn: () => dependentApi.listGuardians(),
  });
}

// ─── Referrals ──────────────────────────────────────────────────────────────

export function useIncomingReferrals(status?: string) {
  return useQuery({
    queryKey: referralKeys.incoming(status),
    queryFn: () => referralApi.incoming(status),
  });
}

export function useOutgoingReferrals() {
  return useQuery({ queryKey: referralKeys.outgoing, queryFn: () => referralApi.outgoing() });
}

export function usePatientReferrals(patientId: string) {
  return useQuery({
    queryKey: referralKeys.forPatient(patientId),
    queryFn: () => referralApi.forPatient(patientId),
    enabled: !!patientId,
  });
}

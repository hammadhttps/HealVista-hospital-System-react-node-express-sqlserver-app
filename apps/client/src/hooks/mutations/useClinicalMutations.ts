import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  historyApi,
  vitalsApi,
  noteApi,
  prescriptionApi,
  dependentApi,
  referralApi,
} from "../../api/clinical";
import {
  historyKeys,
  vitalsKeys,
  noteKeys,
  prescriptionKeys,
  dependentKeys,
  referralKeys,
} from "../queries/useClinical";

// ─── History ────────────────────────────────────────────────────────────────

/**
 * Allergies invalidate the whole history summary, not just the allergy list — the
 * summary embeds them, and a stale summary is what shows a doctor "no known
 * allergies" a second after one was recorded.
 */
function useInvalidateHistory(patientId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: historyKeys.summary(patientId) });
    queryClient.invalidateQueries({ queryKey: historyKeys.allergies(patientId) });
    queryClient.invalidateQueries({ queryKey: historyKeys.conditions(patientId) });
  };
}

export function useAddAllergy(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({
    mutationFn: (data: { allergen: string; severity: string; reaction?: string }) =>
      historyApi.addAllergy(patientId, data),
    onSuccess: invalidate,
  });
}

export function useConfirmAllergy(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({ mutationFn: historyApi.confirmAllergy, onSuccess: invalidate });
}

export function useRemoveAllergy(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({ mutationFn: historyApi.removeAllergy, onSuccess: invalidate });
}

export function useAddCondition(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({
    mutationFn: (data: { condition: string; diagnosedAt?: string; notes?: string }) =>
      historyApi.addCondition(patientId, data),
    onSuccess: invalidate,
  });
}

export function useResolveCondition(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({ mutationFn: historyApi.resolveCondition, onSuccess: invalidate });
}

export function useRemoveCondition(patientId: string) {
  const invalidate = useInvalidateHistory(patientId);
  return useMutation({ mutationFn: historyApi.removeCondition, onSuccess: invalidate });
}

function useInvalidateVaccinations(patientId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: historyKeys.vaccinations(patientId) });
    queryClient.invalidateQueries({ queryKey: historyKeys.summary(patientId) });
  };
}

export function useAddVaccination(patientId: string) {
  const invalidate = useInvalidateVaccinations(patientId);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => historyApi.addVaccination(patientId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateVaccination(patientId: string) {
  const invalidate = useInvalidateVaccinations(patientId);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      historyApi.updateVaccination(id, data),
    onSuccess: invalidate,
  });
}

export function useRemoveVaccination(patientId: string) {
  const invalidate = useInvalidateVaccinations(patientId);
  return useMutation({ mutationFn: historyApi.removeVaccination, onSuccess: invalidate });
}

function useInvalidateSurgeries(patientId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: historyKeys.surgeries(patientId) });
    queryClient.invalidateQueries({ queryKey: historyKeys.summary(patientId) });
  };
}

export function useAddSurgery(patientId: string) {
  const invalidate = useInvalidateSurgeries(patientId);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => historyApi.addSurgery(patientId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateSurgery(patientId: string) {
  const invalidate = useInvalidateSurgeries(patientId);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      historyApi.updateSurgery(id, data),
    onSuccess: invalidate,
  });
}

export function useRemoveSurgery(patientId: string) {
  const invalidate = useInvalidateSurgeries(patientId);
  return useMutation({ mutationFn: historyApi.removeSurgery, onSuccess: invalidate });
}

function useInvalidateFamilyHistory(patientId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: historyKeys.family(patientId) });
    queryClient.invalidateQueries({ queryKey: historyKeys.summary(patientId) });
  };
}

export function useAddFamilyHistory(patientId: string) {
  const invalidate = useInvalidateFamilyHistory(patientId);
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => historyApi.addFamilyHistory(patientId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateFamilyHistory(patientId: string) {
  const invalidate = useInvalidateFamilyHistory(patientId);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      historyApi.updateFamilyHistory(id, data),
    onSuccess: invalidate,
  });
}

export function useRemoveFamilyHistory(patientId: string) {
  const invalidate = useInvalidateFamilyHistory(patientId);
  return useMutation({ mutationFn: historyApi.removeFamilyHistory, onSuccess: invalidate });
}

export function useUpsertLifestyle(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => historyApi.upsertLifestyle(patientId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: historyKeys.lifestyle(patientId) }),
  });
}

// ─── Vitals ─────────────────────────────────────────────────────────────────

export function useRecordVitals(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      readings,
      appointmentId,
    }: {
      readings: { type: string; value: number }[];
      appointmentId?: string;
    }) => vitalsApi.record(patientId, readings, appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vitalsKeys.latest(patientId) });
      queryClient.invalidateQueries({ queryKey: ["vitals", patientId, "list"] });
    },
  });
}

// ─── Notes ──────────────────────────────────────────────────────────────────

/**
 * Autosave. Does **not** invalidate on success — refetching the note while the doctor
 * is typing would overwrite the editor with the server's copy mid-sentence.
 */
export function useSaveNote(appointmentId: string) {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => noteApi.save(appointmentId, data),
  });
}

export function useSignNote(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => noteApi.sign(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.forAppointment(appointmentId) });
      // Signing is what makes the note visible to the patient and unblocks
      // completing the appointment, so the appointment list is stale too.
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useAddAddendum(appointmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => noteApi.addAddendum(appointmentId, content),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: noteKeys.forAppointment(appointmentId) }),
  });
}

export function useSaveNoteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: noteApi.saveTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.templates }),
  });
}

export function useDeleteNoteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: noteApi.deleteTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.templates }),
  });
}

// ─── Prescriptions ──────────────────────────────────────────────────────────

/**
 * The safety dry run. A mutation rather than a query because it is an explicit
 * action with a body, and must never be served from cache — an allergy recorded
 * thirty seconds ago has to change the answer.
 */
export function useCheckPrescriptionSafety() {
  return useMutation({
    mutationFn: ({ appointmentId, medicines }: { appointmentId: string; medicines: string[] }) =>
      prescriptionApi.check(appointmentId, medicines),
  });
}

export function useCreatePrescription(patientId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: prescriptionApi.create,
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: prescriptionKeys.forPatient(patientId) });
      }
      queryClient.invalidateQueries({ queryKey: prescriptionKeys.all });
    },
  });
}

export function useIssuePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acknowledged }: { id: string; acknowledged: string[] }) =>
      prescriptionApi.issue(id, acknowledged),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prescriptionKeys.all }),
  });
}

export function useSaveFavouritePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: prescriptionApi.saveFavourite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prescriptionKeys.favourites }),
  });
}

export function useApplyFavouritePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: prescriptionApi.applyFavourite,
    // useCount changed, which reorders the picker.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prescriptionKeys.favourites }),
  });
}

export function useDeleteFavouritePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: prescriptionApi.deleteFavourite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prescriptionKeys.favourites }),
  });
}

// ─── Dependants ─────────────────────────────────────────────────────────────

function useInvalidateDependents() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: dependentKeys.all });
    // A guardian link widens what appointments and bills the caller can see.
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["bills"] });
  };
}

export function useAddDependent() {
  const invalidate = useInvalidateDependents();
  return useMutation({ mutationFn: dependentApi.add, onSuccess: invalidate });
}

export function useUpdateDependentPermissions() {
  const invalidate = useInvalidateDependents();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      dependentApi.updatePermissions(id, data),
    onSuccess: invalidate,
  });
}

export function useRemoveDependent() {
  const invalidate = useInvalidateDependents();
  return useMutation({ mutationFn: dependentApi.remove, onSuccess: invalidate });
}

// ─── Referrals ──────────────────────────────────────────────────────────────

export function useCreateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: referralApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: referralKeys.outgoing }),
  });
}

export function useRespondToReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => referralApi.respond(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });
}

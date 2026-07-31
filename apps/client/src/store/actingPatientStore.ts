import { create } from "zustand";
import { useAuthStore } from "./authStore";

interface ActingPatientState {
  /** The patient profile currently being viewed — the caller's own record, or a dependant's. */
  actingPatientId: string | null;
  setActingPatient: (patientId: string | null) => void;
}

/**
 * Which patient record the current session is "acting as". A guardian may switch to
 * a dependant's profile; everything patient-facing then uses that id.
 *
 * Client state only — never server data. Session-scoped on purpose: a dependant's
 * context must not survive a logout or a switch of account, so the store resets
 * whenever the authenticated user changes.
 */
export const useActingPatientStore = create<ActingPatientState>((set) => ({
  actingPatientId: null,
  setActingPatient: (actingPatientId) => set({ actingPatientId }),
}));

useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) {
    useActingPatientStore.getState().setActingPatient(null);
  }
});

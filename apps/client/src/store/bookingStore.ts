import { create } from "zustand";

interface BookingSelection {
  doctorId: string | null;
  slotId: string | null;
  date: string | null;
  departmentId: string | null;
  reasonNote: string | null;
  lockedUntil: number | null;
}

interface BookingState {
  selection: BookingSelection;
  step: "search" | "select-slot" | "confirm" | "done";
  setDoctor: (doctorId: string) => void;
  setSlot: (slotId: string, lockedUntil: number) => void;
  setDate: (date: string) => void;
  setDepartment: (departmentId: string) => void;
  setReason: (note: string) => void;
  setStep: (step: BookingState["step"]) => void;
  clearSelection: () => void;
  reset: () => void;
}

const initialSelection: BookingSelection = {
  doctorId: null,
  slotId: null,
  date: null,
  departmentId: null,
  reasonNote: null,
  lockedUntil: null,
};

export const useBookingStore = create<BookingState>()((set) => ({
  selection: { ...initialSelection },
  step: "search",

  setDoctor: (doctorId) => set((s) => ({ selection: { ...s.selection, doctorId, slotId: null } })),

  setSlot: (slotId, lockedUntil) =>
    set((s) => ({ selection: { ...s.selection, slotId, lockedUntil } })),

  setDate: (date) => set((s) => ({ selection: { ...s.selection, date, slotId: null } })),

  setDepartment: (departmentId) => set((s) => ({ selection: { ...s.selection, departmentId } })),

  setReason: (reasonNote) => set((s) => ({ selection: { ...s.selection, reasonNote } })),

  setStep: (step) => set({ step }),

  clearSelection: () => set({ selection: { ...initialSelection } }),

  reset: () => set({ selection: { ...initialSelection }, step: "search" }),
}));

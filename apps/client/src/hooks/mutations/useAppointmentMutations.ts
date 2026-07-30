import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentApi, doctorAvailabilityApi, queueApi, slotApi } from "../../api/appointments";
import { appointmentKeys, availabilityKeys, queueKeys } from "../queries/useAppointments";

export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: appointmentApi.book,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentApi.cancel(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.lists }),
  });
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newSlotId, reason }: { id: string; newSlotId: string; reason?: string }) =>
      appointmentApi.reschedule(id, newSlotId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: appointmentApi.checkIn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.lists }),
  });
}

export function useCheckInScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: appointmentApi.checkInScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.lists });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

export function useStartConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: appointmentApi.startConsultation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.lists }),
  });
}

export function useCompleteConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: appointmentApi.completeConsultation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.lists }),
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, entries }: { doctorId: string; entries: unknown[] }) =>
      doctorAvailabilityApi.updateAvailability(doctorId, entries),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: availabilityKeys.availability(variables.doctorId),
      });
    },
  });
}

export function useCreateException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      doctorId,
      ...data
    }: {
      doctorId: string;
      type: string;
      startDate: string;
      endDate: string;
      reason?: string;
    }) => doctorAvailabilityApi.createException(doctorId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: availabilityKeys.exceptions(variables.doctorId) });
    },
  });
}

export function useDeleteException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, exceptionId }: { doctorId: string; exceptionId: string }) =>
      doctorAvailabilityApi.deleteException(doctorId, exceptionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: availabilityKeys.exceptions(variables.doctorId) });
    },
  });
}

export function useGenerateSlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doctorId?: string) => slotApi.generate(doctorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["slots"] }),
  });
}

export function useCallNextPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doctorId: string) => queueApi.callNext(doctorId),
    onSuccess: (_data, doctorId) => {
      queryClient.invalidateQueries({ queryKey: queueKeys.queue(doctorId) });
    },
  });
}

export function useQueueIssueToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: queueApi.issueToken,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queue"] }),
  });
}

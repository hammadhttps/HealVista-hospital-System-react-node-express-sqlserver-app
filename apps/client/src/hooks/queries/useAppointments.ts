import { useQuery } from "@tanstack/react-query";
import { appointmentApi, doctorAvailabilityApi, queueApi } from "../../api/appointments";

export const appointmentKeys = {
  lists: ["appointments", "list"] as const,
  list: (filters?: Record<string, unknown>) => ["appointments", "list", filters] as const,
  detail: (id: string) => ["appointments", id] as const,
  mine: (filters?: Record<string, unknown>) => ["appointments", "mine", filters] as const,
};

export const availabilityKeys = {
  availability: (doctorId: string) => ["availability", doctorId] as const,
  exceptions: (doctorId: string) => ["exceptions", doctorId] as const,
  slots: (doctorId: string, date: string) => ["slots", doctorId, date] as const,
};

export const queueKeys = {
  queue: (doctorId: string, date?: string) => ["queue", doctorId, date] as const,
  position: (doctorId: string, date: string) => ["queue", "position", doctorId, date] as const,
};

export function useAppointments(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: appointmentKeys.list(filters),
    queryFn: () => appointmentApi.list(filters),
  });
}

export function useMyAppointments(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: appointmentKeys.mine(filters),
    queryFn: () => appointmentApi.listMine(filters),
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: appointmentKeys.detail(id),
    queryFn: () => appointmentApi.getById(id),
    enabled: !!id,
  });
}

export function useDoctorAvailability(doctorId: string) {
  return useQuery({
    queryKey: availabilityKeys.availability(doctorId),
    queryFn: () => doctorAvailabilityApi.getAvailability(doctorId),
    enabled: !!doctorId,
  });
}

export function useDoctorExceptions(doctorId: string) {
  return useQuery({
    queryKey: availabilityKeys.exceptions(doctorId),
    queryFn: () => doctorAvailabilityApi.getExceptions(doctorId),
    enabled: !!doctorId,
  });
}

export function useDoctorSlots(doctorId: string, date: string) {
  return useQuery({
    queryKey: availabilityKeys.slots(doctorId, date),
    queryFn: () => doctorAvailabilityApi.getSlots(doctorId, date),
    enabled: !!doctorId && !!date,
    refetchInterval: 30_000,
  });
}

export function useQueue(doctorId: string, date?: string) {
  return useQuery({
    queryKey: queueKeys.queue(doctorId, date),
    queryFn: () => queueApi.getQueue(doctorId, date),
    enabled: !!doctorId,
    refetchInterval: 15_000,
  });
}

export function useQueuePosition(doctorId: string, date: string) {
  return useQuery({
    queryKey: queueKeys.position(doctorId, date),
    queryFn: () => queueApi.getPosition(doctorId, date),
    enabled: !!doctorId && !!date,
    refetchInterval: 10_000,
  });
}

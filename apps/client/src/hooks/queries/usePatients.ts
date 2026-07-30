import { useQuery } from "@tanstack/react-query";
import { patientApi } from "../../api/patients";

export const patientKeys = {
  lists: ["patients", "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    ["patients", "list", filters] as const,
  detail: (id: string) => ["patients", id] as const,
};

export function usePatients(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: patientKeys.list(params),
    queryFn: () => patientApi.list(params),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: () => patientApi.getById(id),
    enabled: !!id,
  });
}

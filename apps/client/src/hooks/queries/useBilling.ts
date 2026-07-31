import { useQuery } from "@tanstack/react-query";
import { billApi, discountApi, insuranceApi, paymentApi } from "../../api/billing";

export const billKeys = {
  all: ["bills"] as const,
  list: (filters?: Record<string, unknown>) => ["bills", "list", filters] as const,
  mine: (filters?: Record<string, unknown>) => ["bills", "mine", filters] as const,
  detail: (id: string) => ["bills", id] as const,
};

export const discountKeys = {
  all: ["discounts"] as const,
  list: (activeOnly: boolean) => ["discounts", { activeOnly }] as const,
};

export const paymentKeys = {
  all: ["payments"] as const,
  history: (filters?: Record<string, unknown>) => ["payments", "history", filters] as const,
};

export const insuranceKeys = {
  forPatient: (patientId: string) => ["insurance", patientId] as const,
};

export function useBills(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: billKeys.list(filters),
    queryFn: () => billApi.list(filters),
  });
}

export function useMyBills(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: billKeys.mine(filters),
    queryFn: () => billApi.listMine(filters),
  });
}

export function useBill(id: string) {
  return useQuery({
    queryKey: billKeys.detail(id),
    queryFn: () => billApi.getById(id),
    enabled: !!id,
  });
}

export function useDiscounts(activeOnly = false) {
  return useQuery({
    queryKey: discountKeys.list(activeOnly),
    queryFn: () => discountApi.list(activeOnly),
  });
}

export function usePaymentHistory(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: paymentKeys.history(filters),
    queryFn: () => paymentApi.history(filters),
  });
}

export function usePatientInsurance(patientId: string) {
  return useQuery({
    queryKey: insuranceKeys.forPatient(patientId),
    queryFn: () => insuranceApi.listForPatient(patientId),
    enabled: !!patientId,
  });
}

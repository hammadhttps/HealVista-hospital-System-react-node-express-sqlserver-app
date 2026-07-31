import { useQuery } from "@tanstack/react-query";
import { labApi } from "../../api/lab";
import { pharmacyApi, recordApi } from "../../api/pharmacy";

export const labKeys = {
  all: ["lab"] as const,
  tests: (params?: Record<string, unknown>) => ["lab", "tests", params] as const,
  worklist: (status?: string) => ["lab", "worklist", status] as const,
  order: (id: string) => ["lab", "order", id] as const,
  mine: ["lab", "orders", "mine"] as const,
  forPatient: (patientId: string) => ["lab", "orders", "patient", patientId] as const,
};

export const pharmacyKeys = {
  all: ["pharmacy"] as const,
  medicines: (params?: Record<string, unknown>) => ["pharmacy", "medicines", params] as const,
  lowStock: ["pharmacy", "low-stock"] as const,
  expiring: (days?: number) => ["pharmacy", "expiring", days] as const,
  queue: ["pharmacy", "queue"] as const,
  history: (medicineId: string) => ["pharmacy", "history", medicineId] as const,
  recalls: ["pharmacy", "recalls"] as const,
  recallPreview: (medicineId: string, batchNumber: string) =>
    ["pharmacy", "recall-preview", medicineId, batchNumber] as const,
};

export const recordKeys = {
  forPatient: (patientId: string, category?: string) => ["records", patientId, category] as const,
  mine: (category?: string, patientId?: string) =>
    ["records", "mine", category, patientId] as const,
  vault: (patientId?: string) => ["records", "vault", patientId] as const,
};

// ─── Lab ────────────────────────────────────────────────────────────────────

export function useLabTests(params?: { category?: string; search?: string }) {
  return useQuery({ queryKey: labKeys.tests(params), queryFn: () => labApi.listTests(params) });
}

export function useLabWorklist(status?: string) {
  return useQuery({
    queryKey: labKeys.worklist(status),
    queryFn: () => labApi.worklist(status),
    // The worklist is a shared queue — two technicians working from a stale copy
    // collect the same sample twice.
    refetchInterval: 30_000,
  });
}

export function useLabOrder(id: string) {
  return useQuery({
    queryKey: labKeys.order(id),
    queryFn: () => labApi.getOrder(id),
    enabled: !!id,
  });
}

export function useMyLabOrders() {
  return useQuery({ queryKey: labKeys.mine, queryFn: () => labApi.listMine() });
}

export function usePatientLabOrders(patientId: string) {
  return useQuery({
    queryKey: labKeys.forPatient(patientId),
    queryFn: () => labApi.listForPatient(patientId),
    enabled: !!patientId,
  });
}

// ─── Pharmacy ───────────────────────────────────────────────────────────────

export function useMedicines(params?: { search?: string; lowStockOnly?: boolean }) {
  return useQuery({
    queryKey: pharmacyKeys.medicines(params),
    queryFn: () => pharmacyApi.searchMedicines(params),
  });
}

export function useLowStock() {
  return useQuery({ queryKey: pharmacyKeys.lowStock, queryFn: () => pharmacyApi.lowStock() });
}

export function useExpiringStock(days?: number) {
  return useQuery({
    queryKey: pharmacyKeys.expiring(days),
    queryFn: () => pharmacyApi.expiring(days),
  });
}

export function useDispenseQueue() {
  return useQuery({
    queryKey: pharmacyKeys.queue,
    queryFn: () => pharmacyApi.queue(),
    refetchInterval: 30_000,
  });
}

export function useStockHistory(medicineId: string) {
  return useQuery({
    queryKey: pharmacyKeys.history(medicineId),
    queryFn: () => pharmacyApi.stockHistory(medicineId),
    enabled: !!medicineId,
  });
}

export function useRecalls() {
  return useQuery({ queryKey: pharmacyKeys.recalls, queryFn: () => pharmacyApi.listRecalls() });
}

/** Who a recall would reach. Only runs once both fields are chosen. */
export function useRecallPreview(medicineId: string, batchNumber: string) {
  return useQuery({
    queryKey: pharmacyKeys.recallPreview(medicineId, batchNumber),
    queryFn: () => pharmacyApi.previewRecall(medicineId, batchNumber),
    enabled: !!medicineId && !!batchNumber,
  });
}

// ─── Records ────────────────────────────────────────────────────────────────

export function usePatientRecords(patientId: string, category?: string) {
  return useQuery({
    queryKey: recordKeys.forPatient(patientId, category),
    queryFn: () => recordApi.listForPatient(patientId, category),
    enabled: !!patientId,
  });
}

export function useMyRecords(category?: string, patientId?: string, enabled = true) {
  return useQuery({
    queryKey: recordKeys.mine(category, patientId),
    queryFn: () => recordApi.listMine(category, patientId),
    enabled,
  });
}

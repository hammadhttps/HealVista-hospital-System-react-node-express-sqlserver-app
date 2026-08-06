import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { billApi, discountApi, insuranceApi, paymentApi } from "../../api/billing";
import { billKeys, discountKeys, insuranceKeys, paymentKeys } from "../queries/useBilling";

type BillLike = {
  id: string;
  status?: string;
  balance?: string | number;
  amountPaid?: string | number;
  total?: string | number;
  discountId?: string | null;
  discount?: unknown;
  discountAmount?: string | number;
};

type QuerySnapshot = Array<[QueryKey, unknown]>;

function toMoney(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return Math.max(0, value).toFixed(2);
}

function deriveBillStatus(total: number, paid: number, current?: string): string {
  if (current === "void" || current === "draft") return current;
  if (paid <= 0) return "finalised";
  if (paid >= total) return "paid";
  return "partially_paid";
}

function mapBillInPayload(
  payload: unknown,
  billId: string,
  updater: (bill: BillLike) => BillLike,
): unknown {
  if (!payload || typeof payload !== "object") return payload;

  if (Array.isArray(payload)) {
    return payload.map((item): unknown => mapBillInPayload(item, billId, updater));
  }

  const record = payload as Record<string, unknown>;
  if (record.id === billId) return updater(record as BillLike);

  if (Array.isArray(record.data)) {
    return {
      ...record,
      data: record.data.map((item): unknown => mapBillInPayload(item, billId, updater)),
    };
  }

  if (Array.isArray(record.bills)) {
    return {
      ...record,
      bills: record.bills.map((item): unknown => mapBillInPayload(item, billId, updater)),
    };
  }

  return payload;
}

function snapshotBillingQueries(queryClient: ReturnType<typeof useQueryClient>): QuerySnapshot {
  return [
    ...queryClient.getQueriesData({ queryKey: billKeys.all }),
    ...queryClient.getQueriesData({ queryKey: paymentKeys.all }),
  ];
}

function restoreQueries(queryClient: ReturnType<typeof useQueryClient>, snapshot?: QuerySnapshot) {
  snapshot?.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
}

function updateCachedBill(
  queryClient: ReturnType<typeof useQueryClient>,
  billId: string,
  updater: (bill: BillLike) => BillLike,
) {
  queryClient.setQueriesData({ queryKey: billKeys.all }, (old) =>
    mapBillInPayload(old, billId, updater),
  );
}

/** Money moved: bills, payment history, and the patient's own view all go stale. */
function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: billKeys.all });
    queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  };
}

export function useCreateBill() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: billApi.create, onSuccess: invalidate });
}

export function useUpdateBill() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: unknown[] }) => billApi.update(id, items),
    onSuccess: invalidate,
  });
}

export function useFinaliseBill() {
  const invalidate = useInvalidateBilling();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: billApi.finalise,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: billKeys.all });
      const snapshot = snapshotBillingQueries(queryClient);
      updateCachedBill(queryClient, id, (bill) => ({ ...bill, status: "finalised" }));
      return { snapshot };
    },
    onError: (_error, _variables, context) => restoreQueries(queryClient, context?.snapshot),
    onSuccess: invalidate,
  });
}

export function useVoidBill() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => billApi.voidBill(id, reason),
    onSuccess: invalidate,
  });
}

export function useApplyDiscount() {
  const invalidate = useInvalidateBilling();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; discountId?: string; code?: string }) =>
      billApi.applyDiscount(id, payload),
    onMutate: async ({ id, discountId }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.all });
      const snapshot = snapshotBillingQueries(queryClient);
      updateCachedBill(queryClient, id, (bill) => ({
        ...bill,
        discountId: discountId ?? bill.discountId,
      }));
      return { snapshot };
    },
    onError: (_error, _variables, context) => restoreQueries(queryClient, context?.snapshot),
    onSuccess: invalidate,
  });
}

export function useRemoveDiscount() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: billApi.removeDiscount, onSuccess: invalidate });
}

export function useRecordCashPayment() {
  const invalidate = useInvalidateBilling();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentApi.recordCash,
    onMutate: async ({ billId, amount }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.all });
      await queryClient.cancelQueries({ queryKey: paymentKeys.all });
      const snapshot = snapshotBillingQueries(queryClient);
      const paidNow = toMoney(amount);

      updateCachedBill(queryClient, billId, (bill) => {
        const amountPaid = toMoney(bill.amountPaid) + paidNow;
        const total = toMoney(bill.total);
        const balance = toMoney(bill.balance) - paidNow;
        return {
          ...bill,
          amountPaid: money(amountPaid),
          balance: money(balance),
          status: deriveBillStatus(total, amountPaid, bill.status),
        };
      });

      return { snapshot };
    },
    onError: (_error, _variables, context) => restoreQueries(queryClient, context?.snapshot),
    onSuccess: invalidate,
  });
}

export function useCreatePaymentIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: paymentApi.createIntent,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: paymentKeys.all });
      const snapshot = snapshotBillingQueries(queryClient);
      return { snapshot };
    },
    onError: (_error, _variables, context) => restoreQueries(queryClient, context?.snapshot),
    // Invalidating on `onSuccess` only — never on failure. A failed intent (unconfigured
    // gateway, declined card) must surface as an error, not kick off refetches of bills and
    // payment history that loop the network until ERR_INSUFFICIENT_RESOURCES.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: billKeys.all });
    },
  });
}

export function useRefundPayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ paymentId, ...data }: { paymentId: string; amount?: string; reason: string }) =>
      paymentApi.refund(paymentId, data),
    onSuccess: invalidate,
  });
}

export function useCreateDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discountApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKeys.all }),
  });
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      discountApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKeys.all }),
  });
}

export function useDeactivateDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discountApi.deactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKeys.all }),
  });
}

export function useAddInsurance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: insuranceApi.create,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: insuranceKeys.forPatient((variables as { patientId: string }).patientId),
      });
    },
  });
}

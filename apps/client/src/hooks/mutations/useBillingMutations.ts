import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billApi, discountApi, insuranceApi, paymentApi } from "../../api/billing";
import { billKeys, discountKeys, insuranceKeys, paymentKeys } from "../queries/useBilling";

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
  return useMutation({ mutationFn: billApi.finalise, onSuccess: invalidate });
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
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; discountId?: string; code?: string }) =>
      billApi.applyDiscount(id, payload),
    onSuccess: invalidate,
  });
}

export function useRemoveDiscount() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: billApi.removeDiscount, onSuccess: invalidate });
}

export function useRecordCashPayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: paymentApi.recordCash, onSuccess: invalidate });
}

export function useCreatePaymentIntent() {
  return useMutation({ mutationFn: paymentApi.createIntent });
}

export function useRefundPayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({
      paymentId,
      ...data
    }: {
      paymentId: string;
      amount?: string;
      reason: string;
    }) => paymentApi.refund(paymentId, data),
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

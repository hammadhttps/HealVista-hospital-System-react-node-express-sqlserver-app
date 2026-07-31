import { useMutation, useQueryClient } from "@tanstack/react-query";
import { labApi } from "../../api/lab";
import { pharmacyApi, recordApi } from "../../api/pharmacy";
import { labKeys, pharmacyKeys, recordKeys } from "../queries/useLabAndPharmacy";

// ─── Lab ────────────────────────────────────────────────────────────────────

/** Any status change reshuffles the shared worklist, so it always goes stale. */
function useInvalidateLab() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: labKeys.all });
}

export function useCreateLabOrder() {
  const invalidate = useInvalidateLab();
  return useMutation({ mutationFn: labApi.createOrder, onSuccess: invalidate });
}

export function useCancelLabOrder() {
  const invalidate = useInvalidateLab();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => labApi.cancelOrder(id, reason),
    onSuccess: invalidate,
  });
}

export function useCollectSample() {
  const invalidate = useInvalidateLab();
  return useMutation({ mutationFn: labApi.collect, onSuccess: invalidate });
}

export function useStartTesting() {
  const invalidate = useInvalidateLab();
  return useMutation({ mutationFn: labApi.start, onSuccess: invalidate });
}

export function useEnterResults() {
  const invalidate = useInvalidateLab();
  return useMutation({
    mutationFn: ({
      id,
      results,
    }: {
      id: string;
      results: { itemId: string; resultValue: string; unit?: string; flag?: string }[];
    }) => labApi.enterResults(id, results),
    onSuccess: invalidate,
  });
}

export function useVerifyLabOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: labApi.verify,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: labKeys.all });
      // Verification is what releases the result to the patient, so their view of it
      // changes from "pending" to a readable report.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ─── Pharmacy ───────────────────────────────────────────────────────────────

function useInvalidatePharmacy() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
}

export function useAdjustStock() {
  const invalidate = useInvalidatePharmacy();
  return useMutation({ mutationFn: pharmacyApi.adjustStock, onSuccess: invalidate });
}

export function useDispense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      prescriptionId,
      lines,
    }: {
      prescriptionId: string;
      lines: { prescriptionItemId: string; quantity: number; batchNumber?: string }[];
    }) => pharmacyApi.dispense(prescriptionId, lines),
    onSuccess: () => {
      // Dispensing moves stock and closes prescription lines, so both the pharmacy
      // views and the patient's prescription list are stale.
      queryClient.invalidateQueries({ queryKey: pharmacyKeys.all });
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
    },
  });
}

export function useRecallBatch() {
  const invalidate = useInvalidatePharmacy();
  return useMutation({ mutationFn: pharmacyApi.recall, onSuccess: invalidate });
}

// ─── Records ────────────────────────────────────────────────────────────────

/**
 * Uploads straight to Cloudinary using a server-issued signature, then registers the
 * result. The file never passes through our API.
 */
export function useUploadRecord(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      title,
      category,
    }: {
      file: File;
      title: string;
      category?: string;
    }) => {
      const fileType = (file.name.split(".").pop() ?? "").toLowerCase();
      // fileSize is validated server-side against the shared schema's 10 MB cap
      // before a signature is issued.
      const signature = await recordApi.uploadSignature(patientId, fileType, file.size);

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signature.apiKey);
      form.append("timestamp", String(signature.timestamp));
      form.append("public_id", signature.publicId);
      form.append("type", signature.type);
      form.append("signature", signature.signature);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`,
        { method: "POST", body: form },
      );
      if (!res.ok) throw new Error("Upload failed");

      // Register with the publicId we asked to be signed, not whatever came back —
      // the server re-checks it against the patient's folder either way.
      return recordApi.register({
        patientId,
        publicId: signature.publicId,
        title,
        fileType,
        category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["records", patientId] });
      // The acting-patient ("mine") view shares the same records.
      queryClient.invalidateQueries({ queryKey: ["records", "mine"] });
    },
  });
}

export function useDeleteRecord(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.forPatient(patientId) });
      queryClient.invalidateQueries({ queryKey: ["records", "mine"] });
    },
  });
}

/**
 * Fetches a signed URL on demand. A mutation because it is an audited action — the
 * server records that this user opened this document — and must never be cached.
 */
export function useOpenRecord() {
  return useMutation({ mutationFn: recordApi.getUrl });
}

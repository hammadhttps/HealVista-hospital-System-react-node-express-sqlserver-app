import api from "./axiosClient";

export const pharmacyApi = {
  searchMedicines: (params?: {
    search?: string;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  }) => api.get("/pharmacy/medicines", { params }).then((r) => r.data.data),

  findByBarcode: (barcode: string) =>
    api.get(`/pharmacy/medicines/barcode/${encodeURIComponent(barcode)}`).then((r) => r.data.data),

  lowStock: () => api.get("/pharmacy/inventory/low-stock").then((r) => r.data.data),

  expiring: (days?: number) =>
    api.get("/pharmacy/inventory/expiring", { params: { days } }).then((r) => r.data.data),

  adjustStock: (data: {
    medicineId: string;
    changeAmount: number;
    reason: string;
    batchNumber?: string;
    expiryDate?: string;
  }) => api.post("/pharmacy/inventory/adjust", data).then((r) => r.data.data),

  stockHistory: (medicineId: string) =>
    api.get(`/pharmacy/inventory/${medicineId}/history`).then((r) => r.data.data),

  queue: () => api.get("/pharmacy/queue").then((r) => r.data.data),

  dispense: (
    prescriptionId: string,
    lines: { prescriptionItemId: string; quantity: number; batchNumber?: string }[],
  ) =>
    api
      .post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, { lines })
      .then((r) => r.data.data),

  /** Who a recall would reach, before sending it. */
  previewRecall: (medicineId: string, batchNumber: string) =>
    api
      .get(`/pharmacy/recalls/preview/${medicineId}/${encodeURIComponent(batchNumber)}`)
      .then((r) => r.data.data),

  recall: (data: { medicineId: string; batchNumber: string; reason: string }) =>
    api.post("/pharmacy/recalls", data).then((r) => r.data.data),

  listRecalls: () => api.get("/pharmacy/recalls").then((r) => r.data.data),
};

export const recordApi = {
  uploadSignature: (patientId: string, fileType: string, fileSize: number) =>
    api
      .post("/records/upload-signature", { patientId, fileType, fileSize })
      .then((r) => r.data.data),

  register: (data: {
    patientId: string;
    publicId: string;
    title: string;
    fileType: string;
    category?: string;
  }) => api.post("/records", data).then((r) => r.data.data),

  listForPatient: (patientId: string, category?: string) =>
    api.get(`/records/patient/${patientId}`, { params: { category } }).then((r) => r.data.data),

  /** The caller's own records — `patientId` only when a guardian is acting for a dependant. */
  listMine: (category?: string, patientId?: string) =>
    api.get("/records/mine", { params: { category, patientId } }).then((r) => r.data.data),

  /**
   * Fetches a short-lived signed URL for one document. Deliberately per-document and
   * on demand — the list carries no URLs, so nothing hands out live links to files
   * nobody asked to open.
   */
  getUrl: (id: string) => api.get(`/records/${id}/url`).then((r) => r.data.data),

  remove: (id: string) => api.delete(`/records/${id}`).then((r) => r.data.data),

  /** Downloads the merged-PDF Health Vault export as a Blob. */
  exportVault: async (patientId?: string): Promise<Blob> => {
    const res = await api.get("/records/vault/export", {
      params: { patientId },
      responseType: "blob",
    });
    return res.data as Blob;
  },
};

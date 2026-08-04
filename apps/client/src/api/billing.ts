import api from "./axiosClient";

export const billApi = {
  list: (params?: Record<string, unknown>) => api.get("/bills", { params }).then((r) => r.data),

  listMine: (params?: Record<string, unknown>) =>
    api.get("/bills/mine", { params }).then((r) => r.data.data),

  getById: (id: string) => api.get(`/bills/${id}`).then((r) => r.data.data),

  create: (data: {
    patientId: string;
    appointmentId?: string;
    items: {
      kind: string;
      description: string;
      quantity: number;
      unitPrice: string;
      sourceId?: string;
    }[];
  }) => api.post("/bills", data).then((r) => r.data.data),

  update: (id: string, items: unknown[]) =>
    api.patch(`/bills/${id}`, { items }).then((r) => r.data.data),

  finalise: (id: string) => api.post(`/bills/${id}/finalise`).then((r) => r.data.data),

  voidBill: (id: string, reason: string) =>
    api.post(`/bills/${id}/void`, { reason }).then((r) => r.data.data),

  applyDiscount: (id: string, payload: { discountId?: string; code?: string }) =>
    api.post(`/bills/${id}/discount`, payload).then((r) => r.data.data),

  removeDiscount: (id: string) => api.delete(`/bills/${id}/discount`).then((r) => r.data.data),

  /** Opens in a new tab rather than fetching — the endpoint streams a PDF. */
  pdfUrl: (id: string) => `/api/bills/${id}/pdf`,
};

export const discountApi = {
  list: (activeOnly = false) =>
    api
      .get("/discounts", { params: activeOnly ? { active: "true" } : {} })
      .then((r) => r.data.data),

  create: (data: Record<string, unknown>) => api.post("/discounts", data).then((r) => r.data.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/discounts/${id}`, data).then((r) => r.data.data),

  deactivate: (id: string) => api.delete(`/discounts/${id}`).then((r) => r.data.data),
};

export const paymentApi = {
  createIntent: (data: { billId: string; amount?: string; provider?: "stripe" }) =>
    api.post("/payments/create-intent", data).then((r) => r.data.data),

  recordCash: (data: { billId: string; amount: string; reference?: string }) =>
    api.post("/payments/cash", data).then((r) => r.data.data),

  history: (params?: Record<string, unknown>) =>
    api.get("/payments/history", { params }).then((r) => r.data),

  refund: (paymentId: string, data: { amount?: string; reason: string }) =>
    api.post(`/payments/${paymentId}/refund`, data).then((r) => r.data.data),

  receiptUrl: (paymentId: string) => `/api/payments/${paymentId}/receipt`,
};

export const insuranceApi = {
  listForPatient: (patientId: string) =>
    api.get(`/insurance/patient/${patientId}`).then((r) => r.data.data),

  create: (data: Record<string, unknown>) => api.post("/insurance", data).then((r) => r.data.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/insurance/${id}`, data).then((r) => r.data.data),

  deactivate: (id: string) => api.delete(`/insurance/${id}`).then((r) => r.data.data),
};

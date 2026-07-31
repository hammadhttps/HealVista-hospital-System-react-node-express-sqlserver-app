import api from "./axiosClient";

export const labApi = {
  listTests: (params?: { category?: string; search?: string }) =>
    api.get("/lab/tests", { params }).then((r) => r.data.data),

  createOrder: (data: {
    patientId: string;
    appointmentId?: string;
    labTestIds: string[];
    notes?: string;
  }) => api.post("/lab/orders", data).then((r) => r.data.data),

  cancelOrder: (id: string, reason: string) =>
    api.post(`/lab/orders/${id}/cancel`, { reason }).then((r) => r.data.data),

  /** The lab's own queue. Anything not yet finished, oldest first. */
  worklist: (status?: string) =>
    api.get("/lab/worklist", { params: { status } }).then((r) => r.data.data),

  collect: (id: string) => api.post(`/lab/orders/${id}/collect`).then((r) => r.data.data),
  start: (id: string) => api.post(`/lab/orders/${id}/start`).then((r) => r.data.data),

  enterResults: (
    id: string,
    results: { itemId: string; resultValue: string; unit?: string; flag?: string }[],
  ) => api.post(`/lab/orders/${id}/results`, { results }).then((r) => r.data.data),

  /** Pathologist only. This is what releases results to the patient. */
  verify: (id: string) => api.post(`/lab/orders/${id}/verify`).then((r) => r.data.data),

  getOrder: (id: string) => api.get(`/lab/orders/${id}`).then((r) => r.data.data),
  listMine: () => api.get("/lab/orders").then((r) => r.data.data),
  listForPatient: (patientId: string) =>
    api.get(`/lab/patients/${patientId}/orders`).then((r) => r.data.data),
};

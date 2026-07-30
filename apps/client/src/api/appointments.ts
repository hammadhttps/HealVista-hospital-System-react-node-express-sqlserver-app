import api from "./axiosClient";

export const appointmentApi = {
  book: (data: { doctorId: string; slotId: string; departmentId?: string; reasonNote?: string }) =>
    api.post("/appointments", data).then((r) => r.data.data),

  bookWalkIn: (data: {
    patientId: string;
    doctorId: string;
    slotId: string;
    departmentId?: string;
    reasonNote?: string;
  }) => api.post("/appointments/walk-in", data).then((r) => r.data.data),

  list: (params?: Record<string, unknown>) =>
    api.get("/appointments", { params }).then((r) => r.data),

  listMine: (params?: Record<string, unknown>) =>
    api.get("/appointments/mine", { params }).then((r) => r.data),

  getById: (id: string) => api.get(`/appointments/${id}`).then((r) => r.data.data),

  cancel: (id: string, reason: string) =>
    api.patch(`/appointments/${id}/cancel`, { reason }).then((r) => r.data.data),

  reschedule: (id: string, newSlotId: string, reason?: string) =>
    api.post(`/appointments/${id}/reschedule`, { newSlotId, reason }).then((r) => r.data.data),

  checkIn: (qrToken: string) =>
    api.post("/appointments/check-in", { qrToken }).then((r) => r.data.data),

  checkInScan: (qrToken: string) =>
    api.post("/appointments/check-in/scan", { qrToken }).then((r) => r.data.data),

  startConsultation: (id: string) =>
    api.patch(`/appointments/${id}/start`).then((r) => r.data.data),

  completeConsultation: (id: string) =>
    api.patch(`/appointments/${id}/complete`).then((r) => r.data.data),

  getReceipt: (id: string) => api.get(`/appointments/${id}/receipt`).then((r) => r.data.data),
};

export const doctorAvailabilityApi = {
  getAvailability: (doctorId: string) =>
    api.get(`/doctors/${doctorId}/availability`).then((r) => r.data.data),

  updateAvailability: (doctorId: string, entries: unknown[]) =>
    api.put(`/doctors/${doctorId}/availability`, entries).then((r) => r.data.data),

  getExceptions: (doctorId: string) =>
    api.get(`/doctors/${doctorId}/exceptions`).then((r) => r.data.data),

  createException: (
    doctorId: string,
    data: { type: string; startDate: string; endDate: string; reason?: string },
  ) => api.post(`/doctors/${doctorId}/exceptions`, data).then((r) => r.data.data),

  deleteException: (doctorId: string, exceptionId: string) =>
    api.delete(`/doctors/${doctorId}/exceptions/${exceptionId}`).then((r) => r.data.data),

  getSlots: (doctorId: string, date: string) =>
    api.get(`/doctors/${doctorId}/slots/${date}`).then((r) => r.data.data),
};

export const queueApi = {
  issueToken: (data: {
    doctorId: string;
    patientId?: string;
    appointmentId?: string;
    date?: string;
  }) => api.post("/queue/token", data).then((r) => r.data.data),

  getQueue: (doctorId: string, date?: string) =>
    api.get(`/queue/doctor/${doctorId}`, { params: date ? { date } : {} }).then((r) => r.data.data),

  callNext: (doctorId: string) =>
    api.patch(`/queue/doctor/${doctorId}/call-next`).then((r) => r.data.data),

  skip: (tokenId: string) => api.patch(`/queue/${tokenId}/skip`).then((r) => r.data.data),

  getPosition: (doctorId: string, date: string) =>
    api.get(`/queue/doctor/${doctorId}/position/${date}`).then((r) => r.data.data),
};

export const slotApi = {
  generate: (doctorId?: string) =>
    api.post("/appointments/admin/generate-slots", { doctorId }).then((r) => r.data.data),
};

export const doctorSearchApi = {
  search: (params?: Record<string, string | number>) =>
    api.get("/doctors", { params }).then((r) => r.data),

  matchBySymptom: (symptom: string) =>
    api.post("/doctors/match", { symptom }).then((r) => r.data.data),

  getById: (id: string) => api.get(`/doctors/${id}`).then((r) => r.data.data),

  getSlots: (doctorId: string, date: string) =>
    api.get(`/doctors/${doctorId}/slots/${date}`).then((r) => r.data.data),
};

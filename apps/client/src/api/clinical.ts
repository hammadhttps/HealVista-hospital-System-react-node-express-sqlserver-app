import api from "./axiosClient";

/** Medical history — allergies, conditions, vaccinations, surgeries, lifestyle. */
export const historyApi = {
  summary: (patientId: string) =>
    api.get(`/patients/${patientId}/history`).then((r) => r.data.data),

  listAllergies: (patientId: string) =>
    api.get(`/patients/${patientId}/allergies`).then((r) => r.data.data),
  addAllergy: (
    patientId: string,
    data: { allergen: string; severity: string; reaction?: string },
  ) => api.post(`/patients/${patientId}/allergies`, data).then((r) => r.data.data),
  confirmAllergy: (id: string) => api.patch(`/allergies/${id}/confirm`).then((r) => r.data.data),
  removeAllergy: (id: string) => api.delete(`/allergies/${id}`).then((r) => r.data.data),

  listConditions: (patientId: string) =>
    api.get(`/patients/${patientId}/conditions`).then((r) => r.data.data),
  addCondition: (
    patientId: string,
    data: { condition: string; diagnosedAt?: string; notes?: string },
  ) => api.post(`/patients/${patientId}/conditions`, data).then((r) => r.data.data),
  resolveCondition: (id: string) => api.patch(`/conditions/${id}/resolve`).then((r) => r.data.data),
  removeCondition: (id: string) => api.delete(`/conditions/${id}`).then((r) => r.data.data),

  listVaccinations: (patientId: string) =>
    api.get(`/patients/${patientId}/vaccinations`).then((r) => r.data.data),
  addVaccination: (patientId: string, data: Record<string, unknown>) =>
    api.post(`/patients/${patientId}/vaccinations`, data).then((r) => r.data.data),
  updateVaccination: (id: string, data: Record<string, unknown>) =>
    api.patch(`/vaccinations/${id}`, data).then((r) => r.data.data),
  removeVaccination: (id: string) => api.delete(`/vaccinations/${id}`).then((r) => r.data.data),

  listSurgeries: (patientId: string) =>
    api.get(`/patients/${patientId}/surgeries`).then((r) => r.data.data),
  addSurgery: (patientId: string, data: Record<string, unknown>) =>
    api.post(`/patients/${patientId}/surgeries`, data).then((r) => r.data.data),
  updateSurgery: (id: string, data: Record<string, unknown>) =>
    api.patch(`/surgeries/${id}`, data).then((r) => r.data.data),
  removeSurgery: (id: string) => api.delete(`/surgeries/${id}`).then((r) => r.data.data),

  listFamilyHistory: (patientId: string) =>
    api.get(`/patients/${patientId}/family-history`).then((r) => r.data.data),
  addFamilyHistory: (patientId: string, data: Record<string, unknown>) =>
    api.post(`/patients/${patientId}/family-history`, data).then((r) => r.data.data),
  updateFamilyHistory: (id: string, data: Record<string, unknown>) =>
    api.patch(`/family-history/${id}`, data).then((r) => r.data.data),
  removeFamilyHistory: (id: string) => api.delete(`/family-history/${id}`).then((r) => r.data.data),

  getLifestyle: (patientId: string) =>
    api.get(`/patients/${patientId}/lifestyle`).then((r) => r.data.data),
  upsertLifestyle: (patientId: string, data: Record<string, unknown>) =>
    api.put(`/patients/${patientId}/lifestyle`, data).then((r) => r.data.data),
};

export const vitalsApi = {
  list: (patientId: string, params?: Record<string, unknown>) =>
    api.get(`/patients/${patientId}/vitals`, { params }).then((r) => r.data.data),
  latest: (patientId: string) =>
    api.get(`/patients/${patientId}/vitals/latest`).then((r) => r.data.data),
  record: (
    patientId: string,
    readings: { type: string; value: number }[],
    appointmentId?: string,
  ) =>
    api.post(`/patients/${patientId}/vitals`, { readings, appointmentId }).then((r) => r.data.data),
};

export const noteApi = {
  get: (appointmentId: string) =>
    api.get(`/appointments/${appointmentId}/note`).then((r) => r.data.data),
  previous: (appointmentId: string) =>
    api.get(`/appointments/${appointmentId}/note/previous`).then((r) => r.data.data),
  save: (appointmentId: string, data: Record<string, unknown>) =>
    api.put(`/appointments/${appointmentId}/note`, data).then((r) => r.data.data),
  sign: (appointmentId: string) =>
    api.post(`/appointments/${appointmentId}/note/sign`).then((r) => r.data.data),
  addAddendum: (appointmentId: string, content: string) =>
    api.post(`/appointments/${appointmentId}/note/addenda`, { content }).then((r) => r.data.data),
  listForPatient: (patientId: string) =>
    api.get(`/patients/${patientId}/notes`).then((r) => r.data.data),

  listTemplates: () => api.get("/note-templates").then((r) => r.data.data),
  saveTemplate: (data: Record<string, unknown>) =>
    api.post("/note-templates", data).then((r) => r.data.data),
  deleteTemplate: (id: string) => api.delete(`/note-templates/${id}`).then((r) => r.data.data),
};

export const prescriptionApi = {
  /** Dry run — warns the prescriber before they commit to issuing. */
  check: (appointmentId: string, medicines: string[]) =>
    api.post("/prescriptions/check", { appointmentId, medicines }).then((r) => r.data.data),
  create: (data: Record<string, unknown>) =>
    api.post("/prescriptions", data).then((r) => r.data.data),
  issue: (id: string, acknowledgedWarnings: string[]) =>
    api.post(`/prescriptions/${id}/issue`, { acknowledgedWarnings }).then((r) => r.data.data),
  getById: (id: string) => api.get(`/prescriptions/${id}`).then((r) => r.data.data),
  latestDraft: (appointmentId: string) =>
    api.get(`/prescriptions/appointment/${appointmentId}/draft`).then((r) => r.data.data),
  updateDraft: (id: string, data: Record<string, unknown>) =>
    api.put(`/prescriptions/${id}`, data).then((r) => r.data.data),
  listForPatient: (patientId: string) =>
    api.get(`/patients/${patientId}/prescriptions`).then((r) => r.data.data),
  pdfUrl: (id: string) => `/api/prescriptions/${id}/pdf`,

  listFavourites: () => api.get("/prescription-favourites").then((r) => r.data.data),
  saveFavourite: (data: { name: string; items: unknown[] }) =>
    api.post("/prescription-favourites", data).then((r) => r.data.data),
  applyFavourite: (id: string) =>
    api.post(`/prescription-favourites/${id}/apply`).then((r) => r.data.data),
  deleteFavourite: (id: string) =>
    api.delete(`/prescription-favourites/${id}`).then((r) => r.data.data),
};

export const dependentApi = {
  list: () => api.get("/dependents").then((r) => r.data.data),
  listGuardians: () => api.get("/guardians").then((r) => r.data.data),
  /** Links by MRN, never by patient id — an id is guessable from a URL. */
  add: (data: {
    mrn: string;
    relationship: string;
    canViewRecords?: boolean;
    canBookAppointments?: boolean;
  }) => api.post("/dependents", data).then((r) => r.data.data),
  updatePermissions: (id: string, data: Record<string, unknown>) =>
    api.patch(`/dependents/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/dependents/${id}`).then((r) => r.data.data),
};

export const referralApi = {
  create: (data: Record<string, unknown>) => api.post("/referrals", data).then((r) => r.data.data),
  incoming: (status?: string) =>
    api.get("/referrals/incoming", { params: { status } }).then((r) => r.data.data),
  outgoing: () => api.get("/referrals/outgoing").then((r) => r.data.data),
  respond: (id: string, status: string) =>
    api.patch(`/referrals/${id}/respond`, { status }).then((r) => r.data.data),
  forPatient: (patientId: string) =>
    api.get(`/patients/${patientId}/referrals`).then((r) => r.data.data),
};

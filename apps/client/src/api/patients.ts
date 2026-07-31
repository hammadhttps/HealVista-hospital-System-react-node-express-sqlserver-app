import axiosClient from "./axiosClient";

export const patientApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) =>
    axiosClient.get("/patients", { params }).then((r) => r.data),
  getById: (id: string) =>
    axiosClient.get(`/patients/${id}`).then((r) => r.data.data),
  register: (data: any) =>
    axiosClient.post("/patients", data).then((r) => r.data.data),
  update: (id: string, data: any) =>
    axiosClient.patch(`/patients/${id}`, data).then((r) => r.data.data),
};

export const favouriteApi = {
  list: () => axiosClient.get("/patients/me/favourites").then((r) => r.data.data),
  add: (doctorId: string) =>
    axiosClient.post("/patients/me/favourites", { doctorId }).then((r) => r.data.data),
  remove: (doctorId: string) =>
    axiosClient.delete(`/patients/me/favourites/${doctorId}`).then((r) => r.data.data),
};

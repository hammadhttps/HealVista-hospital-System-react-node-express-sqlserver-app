import axiosClient from "./axiosClient";

export const departmentApi = {
  list: () => axiosClient.get("/departments").then((r) => r.data.data),
  getById: (id: string) =>
    axiosClient.get(`/departments/${id}`).then((r) => r.data.data),
  create: (data: any) =>
    axiosClient.post("/departments", data).then((r) => r.data.data),
  update: (id: string, data: any) =>
    axiosClient.patch(`/departments/${id}`, data).then((r) => r.data.data),
  remove: (id: string) => axiosClient.delete(`/departments/${id}`),
};

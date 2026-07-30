import axiosClient from "./axiosClient";

export const holidaysApi = {
  list: () => axiosClient.get("/holidays").then((r) => r.data.data),
  create: (data: { name: string; date: string; departmentId?: string; recurring?: boolean }) =>
    axiosClient.post("/holidays", data).then((r) => r.data.data),
  remove: (id: string) => axiosClient.delete(`/holidays/${id}`),
};

import axiosClient from "./axiosClient";

export const doctorApi = {
  list: (search?: string) =>
    axiosClient
      .get("/doctors", { params: { search } })
      .then((r) => r.data.data),
  getById: (id: string) =>
    axiosClient.get(`/doctors/${id}`).then((r) => r.data.data),
};

import axiosClient from "./axiosClient";

export const staffApi = {
  list: () => axiosClient.get("/staff").then((r) => r.data.data),
  update: (
    userId: string,
    data: { departmentId?: string; designation?: string; status?: string },
  ) => axiosClient.patch(`/staff/${userId}`, data).then((r) => r.data.data),
};

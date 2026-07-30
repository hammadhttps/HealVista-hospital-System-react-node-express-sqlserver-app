import axiosClient from "./axiosClient";

export const settingsApi = {
  get: () => axiosClient.get("/settings").then((r) => r.data.data),
  update: (data: any) =>
    axiosClient.put("/settings", data).then((r) => r.data.data),
};

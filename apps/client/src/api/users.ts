import axiosClient from "./axiosClient";
import type { AdminCreateUserInput } from "@healvista/shared";

export const usersApi = {
  list: (params: { search?: string; role?: string; page?: number; limit?: number }) =>
    axiosClient.get("/users", { params: { page: 1, limit: 100, ...params } }).then((r) => r.data),
  create: (data: AdminCreateUserInput) => axiosClient.post("/users", data).then((r) => r.data.data),
};

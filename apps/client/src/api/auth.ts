import axiosClient from "./axiosClient";

export const authApi = {
  login: (data: { email: string; password: string }) =>
    axiosClient.post("/auth/login", data).then((r) => r.data.data),
  register: (data: { email: string; password: string; fullName: string }) =>
    axiosClient.post("/auth/register", data).then((r) => r.data.data),
  refresh: () => axiosClient.post("/auth/refresh").then((r) => r.data.data),
  logout: () => axiosClient.post("/auth/logout"),
  logoutAll: () => axiosClient.post("/auth/logout-all"),
  me: () => axiosClient.get("/auth/me").then((r) => r.data.data),
  verifyEmail: (token: string) => axiosClient.post("/auth/verify-email", { token }),
  resendVerification: (email: string) => axiosClient.post("/auth/resend-verify", { email }),
  changePassword: (currentPassword: string, newPassword: string) =>
    axiosClient.post("/auth/change-password", { currentPassword, newPassword }),
  changeEmail: (newEmail: string, password: string) =>
    axiosClient.post("/auth/change-email", { newEmail, password }),
  changePhone: (newPhone: string, password: string) =>
    axiosClient.post("/auth/change-phone", { newPhone, password }),
  updateProfile: (data: { fullName?: string; phone?: string; avatarUrl?: string }) =>
    axiosClient.patch("/auth/profile", data).then((r) => r.data.data),
  sessions: () => axiosClient.get("/auth/sessions").then((r) => r.data.data),
  revokeSession: (id: string) => axiosClient.delete(`/auth/sessions/${id}`),
};

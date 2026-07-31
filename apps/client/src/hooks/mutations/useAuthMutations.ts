import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";
/**
 * Post-login landing route per role. Every value must be a real route in App.tsx —
 * roles without a dedicated dashboard yet land on the shared page they actually use.
 */
const LANDING_BY_ROLE: Record<string, string> = {
  ADMIN: "/admin",
  DOCTOR: "/doctor",
  PATIENT: "/patient",
  RECEPTIONIST: "/reception",
  PHARMACIST: "/patients",
  LAB_TECHNICIAN: "/patients",
  ACCOUNTANT: "/patients",
};

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate(LANDING_BY_ROLE[data.user.role] ?? "/");
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      logout();
      queryClient.clear();
    },
  });
}

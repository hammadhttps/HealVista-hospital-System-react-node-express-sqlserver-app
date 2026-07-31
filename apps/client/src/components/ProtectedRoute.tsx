import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RoleRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  /** A single role, or any of several — e.g. a front-desk page ADMIN may also open. */
  role: string | string[];
}) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;

  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

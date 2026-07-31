import {
  Home,
  Users,
  User,
  UserPlus,
  Calendar,
  CalendarDays,
  ListOrdered,
  Building2,
  Settings,
  CalendarOff,
  Bell,
  Heart,
  ScanLine,
  MessageSquare,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../../api/auth";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Role-specific links. Every path here must exist in App.tsx. */
const roleNav: Record<string, NavItem[]> = {
  ADMIN: [
    { to: "/admin", label: "Dashboard", icon: Home },
    { to: "/admin/departments", label: "Departments", icon: Building2 },
    { to: "/admin/staff", label: "Staff", icon: Users },
    { to: "/admin/holidays", label: "Holidays", icon: CalendarOff },
    { to: "/admin/settings", label: "Hospital Settings", icon: Settings },
    { to: "/patients", label: "Patients", icon: User },
    { to: "/doctors", label: "Doctors", icon: User },
  ],
  DOCTOR: [
    { to: "/doctor", label: "Dashboard", icon: Home },
    { to: "/doctor/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/doctor/queue", label: "Live Queue", icon: ListOrdered },
    { to: "/patients", label: "Patients", icon: User },
  ],
  PATIENT: [
    { to: "/patient", label: "Dashboard", icon: Home },
    { to: "/patient/appointments", label: "My Appointments", icon: Calendar },
    { to: "/doctors", label: "Find a Doctor", icon: User },
    { to: "/patient/favourites", label: "Favourites", icon: Heart },
  ],
  RECEPTIONIST: [
    { to: "/reception", label: "Front Desk", icon: ScanLine },
    { to: "/patients/register", label: "Register Patient", icon: UserPlus },
    { to: "/patients", label: "Patients", icon: User },
    { to: "/doctors", label: "Doctors", icon: User },
  ],
  PHARMACIST: [{ to: "/patients", label: "Patients", icon: User }],
  LAB_TECHNICIAN: [{ to: "/patients", label: "Patients", icon: User }],
  ACCOUNTANT: [{ to: "/patients", label: "Patients", icon: User }],
};

/** Available to every authenticated role. */
const sharedNav: NavItem[] = [
  { to: "/notifications/preferences", label: "Notifications", icon: Bell },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/settings", label: "Account", icon: Settings },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 rounded-lg transition font-medium text-gray-700 hover:bg-blue-100 ${
    isActive ? "bg-blue-100 text-blue-700" : ""
  }`;

export default function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const links = role ? (roleNav[role] ?? []) : [];

  return (
    <aside className="h-full w-64 bg-white shadow-lg flex flex-col">
      <div className="p-6 text-2xl font-bold text-blue-600">Healvista</div>

      <nav className="flex-1 px-2 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to.split("/").length === 2} className={linkClass}>
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 space-y-1 mb-2 border-t border-gray-100 pt-2">
        {sharedNav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </div>

      <button
        onClick={async () => {
          await authApi.logout().catch(() => {});
          logout();
          queryClient.clear();
          navigate("/login");
        }}
        className="flex items-center gap-3 px-4 py-2 m-4 rounded-lg text-red-600 hover:bg-red-100 font-medium"
      >
        <LogOut className="w-5 h-5" /> Logout
      </button>
    </aside>
  );
}

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
  Receipt,
  Wallet,
  ScanLine,
  MessageSquare,
  ArrowRightLeft,
  FileText,
  Pill,
  BookOpen,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../../api/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

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
    { to: "/admin/users", label: "Users", icon: UserPlus },
    { to: "/admin/holidays", label: "Holidays", icon: CalendarOff },
    { to: "/admin/settings", label: "Hospital Settings", icon: Settings },
    { to: "/patients", label: "Patients", icon: User },
    { to: "/doctors", label: "Doctors", icon: User },
    { to: "/billing", label: "Billing", icon: Receipt },
    { to: "/billing/payments", label: "Payments", icon: Wallet },
  ],
  DOCTOR: [
    { to: "/doctor", label: "Dashboard", icon: Home },
    { to: "/doctor/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/doctor/queue", label: "Live Queue", icon: ListOrdered },
    { to: "/referrals", label: "Referrals", icon: ArrowRightLeft },
    { to: "/patients", label: "Patients", icon: User },
  ],
  PATIENT: [
    { to: "/patient", label: "Dashboard", icon: Home },
    { to: "/patient/appointments", label: "My Appointments", icon: Calendar },
    { to: "/doctors", label: "Find a Doctor", icon: User },
    { to: "/patient/favourites", label: "Favourites", icon: Heart },
    { to: "/patient/referrals", label: "Referrals", icon: ArrowRightLeft },
    { to: "/patient/records", label: "Health Records", icon: FileText },
    { to: "/patient/bills", label: "My Bills", icon: Receipt },
  ],
  RECEPTIONIST: [
    { to: "/reception", label: "Front Desk", icon: ScanLine },
    { to: "/patients/register", label: "Register Patient", icon: UserPlus },
    { to: "/patients", label: "Patients", icon: User },
    { to: "/doctors", label: "Doctors", icon: User },
    { to: "/billing", label: "Billing", icon: Receipt },
    { to: "/billing/payments", label: "Payments", icon: Wallet },
  ],
  PHARMACIST: [
    { to: "/pharmacy", label: "Pharmacy", icon: Pill },
    { to: "/patients", label: "Patients", icon: User },
  ],
  LAB_TECHNICIAN: [{ to: "/patients", label: "Patients", icon: User }],
  ACCOUNTANT: [
    { to: "/billing", label: "Billing", icon: Receipt },
    { to: "/billing/payments", label: "Payments", icon: Wallet },
    { to: "/patients", label: "Patients", icon: User },
  ],
};

/** Available to every authenticated role. */
const sharedNav: NavItem[] = [
  { to: "/notifications/preferences", label: "Notifications", icon: Bell },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/settings", label: "Account", icon: Settings },
];

/** Staff-only: the hospital knowledge base (policies, FAQs, guidelines). */
const staffNav: NavItem[] = [{ to: "/kb", label: "Knowledge Base", icon: BookOpen }];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 rounded-lg transition font-medium text-gray-700 hover:bg-blue-100 ${
    isActive ? "bg-blue-100 text-blue-700" : ""
  }`;

export default function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation(["auth", "common"]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const links = role ? (roleNav[role] ?? []) : [];

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    logout();
    queryClient.clear();
    navigate("/login");
  };

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
        {role !== "PATIENT" &&
          staffNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end className={linkClass}>
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
        onClick={() => setConfirmOpen(true)}
        className="flex items-center gap-3 px-4 py-2 m-4 rounded-lg text-red-600 hover:bg-red-100 font-medium"
      >
        <LogOut className="w-5 h-5" /> {t("auth.signOut")}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("auth.confirmSignOutTitle")}</DialogTitle>
            <DialogDescription>{t("auth.confirmSignOutBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" /> {t("auth.signOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

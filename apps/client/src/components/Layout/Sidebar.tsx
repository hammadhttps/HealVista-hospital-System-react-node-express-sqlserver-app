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
  key: string;
  icon: LucideIcon;
}

/** Role-specific links. Every path here must exist in App.tsx. */
const roleNav: Record<string, { to: string; key: string; icon: LucideIcon }[]> = {
  ADMIN: [
    { to: "/admin", key: "nav:dashboard", icon: Home },
    { to: "/admin/departments", key: "nav:departments", icon: Building2 },
    { to: "/admin/staff", key: "nav:staff", icon: Users },
    { to: "/admin/users", key: "nav:users", icon: UserPlus },
    { to: "/admin/holidays", key: "nav:holidays", icon: CalendarOff },
    { to: "/admin/settings", key: "nav:hospitalSettings", icon: Settings },
    { to: "/patients", key: "nav:patients", icon: User },
    { to: "/doctors", key: "nav:doctors", icon: User },
    { to: "/billing", key: "nav:billing", icon: Receipt },
    { to: "/billing/payments", key: "nav:payments", icon: Wallet },
  ],
  DOCTOR: [
    { to: "/doctor", key: "nav:dashboard", icon: Home },
    { to: "/doctor/schedule", key: "nav:mySchedule", icon: CalendarDays },
    { to: "/doctor/queue", key: "nav:liveQueue", icon: ListOrdered },
    { to: "/referrals", key: "nav:referrals", icon: ArrowRightLeft },
    { to: "/patients", key: "nav:patients", icon: User },
  ],
  PATIENT: [
    { to: "/patient", key: "nav:dashboard", icon: Home },
    { to: "/patient/appointments", key: "nav:myAppointments", icon: Calendar },
    { to: "/doctors", key: "nav:findDoctor", icon: User },
    { to: "/patient/favourites", key: "nav:favourites", icon: Heart },
    { to: "/patient/referrals", key: "nav:referrals", icon: ArrowRightLeft },
    { to: "/patient/records", key: "nav:healthRecords", icon: FileText },
    { to: "/patient/bills", key: "nav:myBills", icon: Receipt },
  ],
  RECEPTIONIST: [
    { to: "/reception", key: "nav:frontDesk", icon: ScanLine },
    { to: "/patients/register", key: "nav:registerPatient", icon: UserPlus },
    { to: "/patients", key: "nav:patients", icon: User },
    { to: "/doctors", key: "nav:doctors", icon: User },
    { to: "/billing", key: "nav:billing", icon: Receipt },
    { to: "/billing/payments", key: "nav:payments", icon: Wallet },
  ],
  PHARMACIST: [
    { to: "/pharmacy", key: "nav:pharmacy", icon: Pill },
    { to: "/patients", key: "nav:patients", icon: User },
  ],
  LAB_TECHNICIAN: [{ to: "/patients", key: "nav:patients", icon: User }],
  ACCOUNTANT: [
    { to: "/billing", key: "nav:billing", icon: Receipt },
    { to: "/billing/payments", key: "nav:payments", icon: Wallet },
    { to: "/patients", key: "nav:patients", icon: User },
  ],
};

/** Available to every authenticated role. */
const sharedNav: { to: string; key: string; icon: LucideIcon }[] = [
  { to: "/notifications/preferences", key: "nav:notifications", icon: Bell },
  { to: "/chat", key: "nav:chat", icon: MessageSquare },
  { to: "/settings", key: "nav:account", icon: Settings },
];

/** Staff-only: the hospital knowledge base (policies, FAQs, guidelines). */
const staffNav: { to: string; key: string; icon: LucideIcon }[] = [
  { to: "/kb", key: "nav:knowledgeBase", icon: BookOpen },
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
  const { t } = useTranslation(["auth", "common", "nav"]);
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
      <div className="p-6 text-2xl font-bold text-blue-600">{t("common:appName")}</div>

      <nav className="flex-1 px-2 space-y-1">
        {links.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to.split("/").length === 2} className={linkClass}>
            <Icon className="w-5 h-5" />
            {t(key)}
          </NavLink>
        ))}
        {role !== "PATIENT" &&
          staffNav.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end className={linkClass}>
              <Icon className="w-5 h-5" />
              {t(key)}
            </NavLink>
          ))}
      </nav>

      <div className="px-2 space-y-1 mb-2 border-t border-gray-100 pt-2">
        {sharedNav.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon className="w-5 h-5" />
            {t(key)}
          </NavLink>
        ))}
      </div>

      <button
        onClick={() => setConfirmOpen(true)}
        className="flex items-center gap-3 px-4 py-2 m-4 rounded-lg text-red-600 hover:bg-red-100 font-medium"
      >
        <LogOut className="w-5 h-5" /> {t("auth:signOut")}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("auth:confirmSignOutTitle")}</DialogTitle>
            <DialogDescription>{t("auth:confirmSignOutBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" /> {t("auth:signOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

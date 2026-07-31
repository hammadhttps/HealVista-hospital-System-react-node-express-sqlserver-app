import { useAuthStore } from "../../store/authStore";
import { NotificationBell } from "../notifications/NotificationBell";
import ProfileSwitcher from "./ProfileSwitcher";

export default function Header() {
  const user = useAuthStore((state) => state.user);

  return (
    <header className="w-full h-16 bg-white shadow flex items-center justify-between px-8">
      <div className="text-xl font-semibold text-blue-700">Dashboard</div>
      <div className="flex items-center gap-4">
        {user?.role === "PATIENT" && <ProfileSwitcher />}
        <NotificationBell />
        <div className="text-gray-700 font-medium">
          {user?.email}
          {user?.role && <span className="text-sm text-gray-400 ml-2">({user.role})</span>}
        </div>
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 font-bold">
          {user?.email?.[0]?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}

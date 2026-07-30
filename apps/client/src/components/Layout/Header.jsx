import useAuthStore from '../../store/useAuthStore';

export default function Header() {
    const user = useAuthStore((state) => state.user);
    const role = useAuthStore((state) => state.role);

    return (
        <header className="w-full h-16 bg-white shadow flex items-center justify-between px-8">
            <div className="text-xl font-semibold text-blue-700">Dashboard</div>
            <div className="flex items-center gap-4">
                <div className="text-gray-700 font-medium">
                    {user?.full_name} <span className="text-sm text-gray-400 ml-2">({role})</span>
                </div>
                {/* Notifications placeholder */}
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 font-bold">{user?.full_name?.[0]}</div>
            </div>
        </header>
    );
} 
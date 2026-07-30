import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { LayoutDashboard, Stethoscope, User, Calendar, Activity, Pill, Ambulance, LogOut } from 'lucide-react';

export default function Layout({ children }) {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { path: '/doctor', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/doctor/appointments', icon: Calendar, label: 'Appointments' },
        { path: '/doctor/patients', icon: User, label: 'Patients' },
        { path: '/doctor/labs', icon: Activity, label: 'Lab Tests' },
        { path: '/doctor/pharmacy', icon: Pill, label: 'Pharmacy' },
        { path: '/doctor/ambulance', icon: Ambulance, label: 'Ambulance' }
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile menu button */}
            <button
                className="md:hidden fixed top-4 right-4 z-50 p-2 rounded-md bg-green-600 text-white"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Sidebar */}
            <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static inset-y-0 left-0 w-64 bg-green-800 text-white transition-transform duration-300 ease-in-out z-40`}>
                <div className="flex items-center justify-center h-16 px-4 border-b border-green-700">
                    <div className="flex items-center">
                        <Stethoscope className="h-8 w-8 mr-2" />
                        <span className="text-xl font-semibold">HealVista</span>
                    </div>
                </div>
                <div className="flex flex-col h-full p-4">
                    <div className="mt-6 flex-1">
                        <nav className="space-y-2">
                            {navItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className="flex items-center px-4 py-3 rounded-lg hover:bg-green-700 transition"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <item.icon className="w-5 h-5 mr-3" />
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="pb-4">
                        <div className="flex items-center px-4 py-3 text-sm">
                            <div className="flex-shrink-0">
                                <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center">
                                    {user?.full_name?.charAt(0) || 'D'}
                                </div>
                            </div>
                            <div className="ml-3">
                                <p className="font-medium">Dr. {user?.full_name}</p>
                                <p className="text-green-200">{user?.specialization}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center px-4 py-3 rounded-lg hover:bg-green-700 transition mt-2"
                        >
                            <LogOut className="w-5 h-5 mr-3" />
                            Sign out
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Overlay for mobile menu */}
                {mobileMenuOpen && (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                )}

                {/* Content area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
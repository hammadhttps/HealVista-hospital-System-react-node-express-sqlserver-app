import { Home, Users, User, Calendar, FlaskConical, Pill, FileText, Ambulance, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

const navConfig = {
    admin: [
        { to: '/admin', label: 'Dashboard', icon: Home },
        { to: '/admin/users', label: 'Users', icon: Users },
        { to: '/admin/doctors', label: 'Doctors', icon: User },
        { to: '/admin/patients', label: 'Patients', icon: User },
        { to: '/admin/appointments', label: 'Appointments', icon: Calendar },
        { to: '/admin/labs', label: 'Labs', icon: FlaskConical },
        { to: '/admin/pharmacy', label: 'Pharmacy', icon: Pill },
        { to: '/admin/billing', label: 'Billing', icon: FileText },
        { to: '/admin/ambulances', label: 'Ambulances', icon: Ambulance },
    ],
    doctor: [
        { to: '/doctor', label: 'Dashboard', icon: Home },
        { to: '/doctor/appointments', label: 'Appointments', icon: Calendar },
        { to: '/doctor/patients', label: 'Patients', icon: User },
        { to: '/doctor/labs', label: 'Labs', icon: FlaskConical },
        { to: '/doctor/pharmacy', label: 'Pharmacy', icon: Pill },
        { to: '/doctor/ambulances', label: 'Ambulances', icon: Ambulance },
    ],
    patient: [
        { to: '/patient', label: 'Dashboard', icon: Home },
        { to: '/patient/doctors', label: 'Doctors', icon: User },
        { to: '/patient/appointments', label: 'Appointments', icon: Calendar },
        { to: '/patient/labs', label: 'Labs', icon: FlaskConical },
        { to: '/patient/pharmacy', label: 'Pharmacy', icon: Pill },
        { to: '/patient/billing', label: 'Billing', icon: FileText },
        { to: '/patient/feedback', label: 'Feedback', icon: FileText },
    ],
};

export default function Sidebar() {
    const { role, logout } = useAuthStore();
    const navigate = useNavigate();
    const links = navConfig[role] || [];

    return (
        <aside className="h-full w-64 bg-white shadow-lg flex flex-col">
            <div className="p-6 text-2xl font-bold text-blue-600">Healvista</div>
            <nav className="flex-1 px-2 space-y-1">
                {links.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2 rounded-lg transition font-medium text-gray-700 hover:bg-blue-100 ${isActive ? 'bg-blue-100 text-blue-700' : ''}`
                        }
                    >
                        <Icon className="w-5 h-5" />
                        {label}
                    </NavLink>
                ))}
            </nav>
            <button
                onClick={() => { logout(); navigate('/login'); }}
                className="flex items-center gap-3 px-4 py-2 m-4 rounded-lg text-red-600 hover:bg-red-100 font-medium"
            >
                <LogOut className="w-5 h-5" /> Logout
            </button>
        </aside>
    );
} 
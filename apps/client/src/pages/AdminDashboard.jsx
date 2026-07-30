import { useEffect, useState } from 'react';
import {
    Stethoscope, User, Calendar, Activity, Pill, Ambulance,
    DollarSign, MessageSquare, ClipboardList, Users, AlertCircle
} from 'lucide-react';
import Layout from '../components/Layout/Layout';
import StatCard from '../components/UI/StatCard';
import DataTable from '../components/UI/DataTable';
import StatusBadge from '../components/UI/StatusBadge';
import AdminFeedback from './AdminFeedback';
import AdminAmbulances from './AdminAmbulances';
import AdminBilling from './AdminBilling';
import AdminLabs from './AdminLabs';
import AdminPharmacy from './AdminPharmacy';
import AdminAppointments from './AdminAppointments';
import AdminPatients from './AdminPatients';
import AdminDoctors from './AdminDoctors';
import AdminUsers from './AdminUsers';

// Sample data for demonstration (replace with actual API calls)
const sampleCriticalPatients = [
    { id: 'P1001', name: 'John Doe', condition: 'Cardiac Arrest', status: 'critical' },
    { id: 'P1002', name: 'Jane Smith', condition: 'Severe Trauma', status: 'critical' },
];

const sampleRecentAppointments = [
    { id: 'A1001', patient: 'John Doe', doctor: 'Dr. Smith', date: '2025-07-25T10:00:00', status: 'completed' },
    { id: 'A1002', patient: 'Jane Smith', doctor: 'Dr. Johnson', date: '2025-07-25T14:30:00', status: 'confirmed' },
];

const statsEndpoints = [
    { label: 'Doctors', endpoint: '/api/doctors/stats/total', key: 'doctors', icon: Stethoscope, color: 'blue' },
    { label: 'Patients', endpoint: '/api/patients/stats/total', key: 'patients', icon: User, color: 'green' },
    { label: 'Today Patients', endpoint: '/api/patients/stats/today', key: 'todayPatients', icon: User, color: 'teal' },
    { label: 'Critical Patients', endpoint: '/api/patients/stats/critical', key: 'criticalPatients', icon: AlertCircle, color: 'red' },
    { label: 'Appointments', endpoint: '/api/appointments/stats/total', key: 'appointments', icon: Calendar, color: 'purple' },
    { label: 'Billing', endpoint: '/api/appointments/stats/billing', key: 'billing', icon: DollarSign, color: 'yellow' },
    { label: 'Pharmacy', endpoint: '/api/pharmacy/stats/total', key: 'pharmacy', icon: Pill, color: 'pink' },
    { label: 'Labs', endpoint: '/api/lab/stats/total', key: 'labs', icon: Activity, color: 'indigo' },
    { label: 'Feedbacks', endpoint: '/api/feedback/stats/total', key: 'feedbacks', icon: MessageSquare, color: 'orange' },
];

export default function AdminDashboard() {
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        async function fetchStats() {
            setLoading(true);
            const results = await Promise.all(
                statsEndpoints.map(async ({ endpoint, key }) => {
                    try {
                        const res = await fetch(endpoint);
                        const data = await res.json();
                        return { key, value: data.total || data.count || 0 };
                    } catch {
                        return { key, value: 0 };
                    }
                })
            );
            setStats(Object.fromEntries(results.map(({ key, value }) => [key, value])));
            setLoading(false);
        }
        fetchStats();
    }, []);

    return (
        <Layout>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-green-800 flex items-center">
                    <ClipboardList className="mr-3 w-8 h-8" />
                    Admin Dashboard
                </h1>
                <div className="text-lg text-gray-600">
                    System Overview
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                {[
                    { id: 'overview', icon: ClipboardList, label: 'Overview' },
                    { id: 'users', icon: Users, label: 'Users' },
                    { id: 'doctors', icon: Stethoscope, label: 'Doctors' },
                    { id: 'patients', icon: User, label: 'Patients' },
                    { id: 'appointments', icon: Calendar, label: 'Appointments' },
                    { id: 'pharmacy', icon: Pill, label: 'Pharmacy' },
                    { id: 'labs', icon: Activity, label: 'Labs' },
                    { id: 'billing', icon: DollarSign, label: 'Billing' },
                    { id: 'ambulances', icon: Ambulance, label: 'Ambulances' },
                    { id: 'feedback', icon: MessageSquare, label: 'Feedback' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        className={`flex-shrink-0 flex items-center px-4 py-2 ${activeTab === tab.id ? 'border-b-2 border-green-600 text-green-700 font-medium' : 'text-gray-600 hover:text-green-600'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon className="w-5 h-5 mr-2" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="space-y-8">

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {statsEndpoints.map(({ label, key, icon, color }) => (
                            <StatCard
                                key={key}
                                icon={icon}
                                title={label}
                                value={loading ? '...' : stats[key] ?? 0}
                                color={color}
                            />
                        ))}
                    </div>

                    {/* Critical Patients Section */}
                    <div className="bg-white rounded-xl shadow-md p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center">
                            <AlertCircle className="mr-2 text-red-600" />
                            Critical Patients
                        </h2>
                        <DataTable
                            columns={[
                                { header: 'Patient ID', accessor: 'id' },
                                { header: 'Name', accessor: 'name' },
                                { header: 'Condition', accessor: 'condition' },
                                {
                                    header: 'Status',
                                    accessor: 'status',
                                    cell: (value) => <StatusBadge status={value} />
                                }
                            ]}
                            data={sampleCriticalPatients}
                            emptyMessage="No critical patients currently"
                        />
                    </div>

                    {/* Recent Appointments Section */}
                    <div className="bg-white rounded-xl shadow-md p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center">
                            <Calendar className="mr-2 text-blue-600" />
                            Recent Appointments
                        </h2>
                        <DataTable
                            columns={[
                                { header: 'Appointment ID', accessor: 'id' },
                                { header: 'Patient', accessor: 'patient' },
                                { header: 'Doctor', accessor: 'doctor' },
                                {
                                    header: 'Date',
                                    accessor: 'date',
                                    cell: (value) => new Date(value).toLocaleString()
                                },
                                {
                                    header: 'Status',
                                    accessor: 'status',
                                    cell: (value) => <StatusBadge status={value} />
                                }
                            ]}
                            data={sampleRecentAppointments}
                            emptyMessage="No recent appointments"
                        />
                    </div>
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminUsers />
                    <h2 className="text-xl font-semibold mb-4">Users Management</h2>
                    <p className="text-gray-500">Users management content would be loaded here</p>
                </div>
            )}

            {/* Doctors Tab */}
            {activeTab === 'doctors' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminDoctors />
                    <h2 className="text-xl font-semibold mb-4">Doctors Management</h2>
                    <p className="text-gray-500">Doctors management content would be loaded here</p>
                </div>
            )}

            {/* Patients Tab */}
            {activeTab === 'patients' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminPatients />
                    <h2 className="text-xl font-semibold mb-4">Patients Management</h2>
                    <p className="text-gray-500">Patients management content would be loaded here</p>
                </div>
            )}

            {/* Appointments Tab */}
            {activeTab === 'appointments' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminAppointments />
                    <h2 className="text-xl font-semibold mb-4">Appointments Management</h2>
                    <p className="text-gray-500">Appointments management content would be loaded here</p>
                </div>
            )}

            {/* Pharmacy Tab */}
            {activeTab === 'pharmacy' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminPharmacy />
                    <h2 className="text-xl font-semibold mb-4">Pharmacy Management</h2>
                    <p className="text-gray-500">Pharmacy management content would be loaded here</p>
                </div>
            )}

            {/* Labs Tab */}
            {activeTab === 'labs' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminLabs />
                    <h2 className="text-xl font-semibold mb-4">Laboratory Management</h2>
                    <p className="text-gray-500">Laboratory management content would be loaded here</p>
                </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminBilling />
                    <h2 className="text-xl font-semibold mb-4">Billing Management</h2>
                    <p className="text-gray-500">Billing management content would be loaded here</p>
                </div>
            )}

            {/* Ambulances Tab */}
            {activeTab === 'ambulances' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminAmbulances />
                    <h2 className="text-xl font-semibold mb-4">Ambulance Services</h2>
                    <p className="text-gray-500">Ambulance services content would be loaded here</p>
                </div>
            )}

            {/* Feedback Tab */}
            {activeTab === 'feedback' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <AdminFeedback />
                    <h2 className="text-xl font-semibold mb-4">Patient Feedback</h2>
                    <p className="text-gray-500">Patient feedback content would be loaded here</p>
                </div>
            )}
        </Layout>
    );
}
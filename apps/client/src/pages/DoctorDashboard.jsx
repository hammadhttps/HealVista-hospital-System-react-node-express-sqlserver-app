import { useEffect, useState } from 'react';
import { Calendar, Stethoscope, User, ClipboardList, Activity, Pill, Ambulance, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import DataTable from '../components/UI/DataTable';
import useAuthStore from '../store/useAuthStore';
// StatusBadge from '../components/UI/StatusBadge';

const appointmentColumns = [
    {
        header: 'Appointment ID',
        accessor: 'appointment_id',
        cell: (value) => <span className="font-mono text-sm">#{value}</span>
    },
    {
        header: 'Patient',
        accessor: 'patient_name',
        cell: (value, row) => (
            <div className="flex items-center">
                <User className="w-4 h-4 mr-2 text-green-600" />
                <span>{value}</span>
            </div>
        )
    },
    {
        header: 'Date & Time',
        accessor: 'appointment_date',
        cell: (value) => new Date(value).toLocaleString()
    },
    {
        header: 'Status',
        accessor: 'status',
        cell: (value) => <StatusBadge status={value} />
    },
    {
        header: 'Actions',
        accessor: 'appointment_id',
        cell: (value, row) => (
            <div className="flex space-x-2">
                {row.status === 'pending' && (
                    <button
                        onClick={() => handleCompleteAppointment(value)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                    >
                        Complete
                    </button>
                )}
                <button
                    onClick={() => viewAppointmentDetails(value)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                >
                    Details
                </button>
            </div>
        )
    }
];

const patientColumns = [
    {
        header: 'Patient ID',
        accessor: 'patient_id',
        cell: (value) => <span className="font-mono text-sm">#{value}</span>
    },
    {
        header: 'Full Name',
        accessor: 'full_name',
        cell: (value) => <span className="font-medium">{value}</span>
    },
    {
        header: 'Gender',
        accessor: 'gender',
        cell: (value) => <span className="capitalize">{value}</span>
    },
    {
        header: 'Contact',
        accessor: 'contact_info',
        cell: (value) => (
            <div className="flex flex-col">
                <span>{value.phone}</span>
                <span className="text-xs text-gray-500">{value.email}</span>
            </div>
        )
    },
    {
        header: 'Actions',
        accessor: 'patient_id',
        cell: (value) => (
            <button
                onClick={() => viewPatientDetails(value)}
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
            >
                View
            </button>
        )
    }
];

const labColumns = [
    {
        header: 'Test',
        accessor: 'test_name',
        cell: (value) => <span className="font-medium">{value}</span>
    },
    {
        header: 'Patient',
        accessor: 'patient_name'
    },
    {
        header: 'Date',
        accessor: 'test_date',
        cell: (value) => new Date(value).toLocaleDateString()
    },
    {
        header: 'Status',
        accessor: 'status',
        cell: (value) => <StatusBadge status={value} />
    },
    {
        header: 'Result',
        accessor: 'result',
        cell: (value, row) => (
            row.status === 'completed' ? (
                <span className="text-sm">{value || 'No result'}</span>
            ) : (
                <span className="text-gray-400 text-sm">Pending</span>
            )
        )
    },
    {
        header: 'Actions',
        accessor: 'test_id',
        cell: (value, row) => (
            <div className="flex space-x-2">
                {row.status === 'pending' && (
                    <button
                        onClick={() => updateLabResult(value)}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                    >
                        Update
                    </button>
                )}
                <button
                    onClick={() => viewLabDetails(value)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                >
                    Details
                </button>
            </div>
        )
    }
];

export default function DoctorDashboard() {
    const user = useAuthStore((state) => state.user);
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [labs, setLabs] = useState([]);
    const [stats, setStats] = useState({
        todayAppointments: 0,
        totalPatients: 0,
        pendingLabs: 0,
        criticalPatients: 0
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // Fetch appointments for this doctor
                const appRes = await fetch(`/api/appointments/doctor/${user?.user_id}`);
                const appData = await appRes.json();
                setAppointments(appData);

                // Fetch all patients
                const patRes = await fetch('/api/appoint_patients');
                const patData = await patRes.json();
                setPatients(patData);

                // Fetch labs
                const labRes = await fetch('/api/lab');
                const labData = await labRes.json();
                const relevantLabs = labData.filter(l =>
                    appData.some(a => a.patient_id === l.patient_id)
                );
                setLabs(relevantLabs);

                // Fetch stats
                const todayApps = appData.filter(a =>
                    new Date(a.appointment_date).toDateString() === new Date().toDateString()
                ).length;

                const critPatientsRes = await fetch('/api/patients/stats/critical');
                const critPatients = await critPatientsRes.json();

                setStats({
                    todayAppointments: todayApps,
                    totalPatients: patData.length,
                    pendingLabs: relevantLabs.filter(l => l.status === 'pending').length,
                    criticalPatients: critPatients.count || 0
                });
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        }

        if (user?.user_id) fetchData();
    }, [user]);

    const handleCompleteAppointment = async (appointmentId) => {
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' })
            });

            if (res.ok) {
                setAppointments(appointments.map(appt =>
                    appt.appointment_id === appointmentId
                        ? { ...appt, status: 'completed' }
                        : appt
                ));
            }
        } catch (error) {
            console.error('Error completing appointment:', error);
        }
    };

    const updateLabResult = async (testId) => {
        // Implementation for updating lab results
        console.log('Update lab result:', testId);
    };

    const viewAppointmentDetails = (appointmentId) => {
        // Implementation for viewing appointment details
        console.log('View appointment:', appointmentId);
    };

    const viewPatientDetails = (patientId) => {
        // Implementation for viewing patient details
        console.log('View patient:', patientId);
    };

    const viewLabDetails = (testId) => {
        // Implementation for viewing lab details
        console.log('View lab test:', testId);
    };

    return (
        <Layout>
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-green-800 flex items-center">
                    <Stethoscope className="mr-3 w-8 h-8" />
                    Doctor Dashboard
                </h1>
                <div className="text-lg text-gray-600">
                    Welcome, <span className="font-semibold text-green-700">Dr. {user?.full_name}</span>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
                {[
                    { id: 'dashboard', icon: ClipboardList, label: 'Overview' },
                    { id: 'appointments', icon: Calendar, label: 'Appointments' },
                    { id: 'patients', icon: User, label: 'Patients' },
                    { id: 'labs', icon: Activity, label: 'Lab Tests' },
                    { id: 'pharmacy', icon: Pill, label: 'Pharmacy' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        className={`flex items-center px-4 py-2 ${activeTab === tab.id ? 'border-b-2 border-green-600 text-green-700 font-medium' : 'text-gray-600 hover:text-green-600'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon className="w-5 h-5 mr-2" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Dashboard Overview Tab */}
            {activeTab === 'dashboard' && (
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Today's Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <StatCard
                            icon={Calendar}
                            title="Today's Appointments"
                            value={stats.todayAppointments}
                            color="green"
                            loading={loading}
                        />
                        <StatCard
                            icon={User}
                            title="Total Patients"
                            value={stats.totalPatients}
                            color="blue"
                            loading={loading}
                        />
                        <StatCard
                            icon={Activity}
                            title="Pending Labs"
                            value={stats.pendingLabs}
                            color="orange"
                            loading={loading}
                        />
                        <StatCard
                            icon={AlertCircle}
                            title="Critical Patients"
                            value={stats.criticalPatients}
                            color="red"
                            loading={loading}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold flex items-center">
                                    <Clock className="w-5 h-5 mr-2 text-green-600" />
                                    Upcoming Appointments
                                </h3>
                                <button
                                    onClick={() => setActiveTab('appointments')}
                                    className="text-sm text-green-600 hover:text-green-800"
                                >
                                    View All
                                </button>
                            </div>
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
                                </div>
                            ) : appointments.length > 0 ? (
                                <div className="space-y-3">
                                    {appointments
                                        .filter(a => a.status === 'pending' || a.status === 'confirmed')
                                        .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
                                        .slice(0, 5)
                                        .map(appt => (
                                            <div key={appt.appointment_id} className="border border-gray-100 rounded-lg p-3 hover:bg-green-50 transition">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h4 className="font-medium">{appt.patient_name}</h4>
                                                        <p className="text-sm text-gray-600">
                                                            {new Date(appt.appointment_date).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <StatusBadge status={appt.status} />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-4">No upcoming appointments</p>
                            )}
                        </div>

                        <div className="bg-white rounded-xl shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold flex items-center">
                                    <Activity className="w-5 h-5 mr-2 text-green-600" />
                                    Pending Lab Tests
                                </h3>
                                <button
                                    onClick={() => setActiveTab('labs')}
                                    className="text-sm text-green-600 hover:text-green-800"
                                >
                                    View All
                                </button>
                            </div>
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
                                </div>
                            ) : labs.filter(l => l.status === 'pending').length > 0 ? (
                                <div className="space-y-3">
                                    {labs
                                        .filter(l => l.status === 'pending')
                                        .slice(0, 5)
                                        .map(lab => (
                                            <div key={lab.test_id} className="border border-gray-100 rounded-lg p-3 hover:bg-green-50 transition">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h4 className="font-medium">{lab.test_name}</h4>
                                                        <p className="text-sm text-gray-600">{lab.patient_name}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateLabResult(lab.test_id)}
                                                        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                                                    >
                                                        Update
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-4">No pending lab tests</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Appointments Tab */}
            {activeTab === 'appointments' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-green-600" />
                            Appointments
                        </h2>
                        <div className="flex space-x-2">
                            <select className="border border-gray-300 rounded px-3 py-1 text-sm">
                                <option>All Status</option>
                                <option>Pending</option>
                                <option>Completed</option>
                                <option>Cancelled</option>
                            </select>
                            <input
                                type="date"
                                className="border border-gray-300 rounded px-3 py-1 text-sm"
                            />
                        </div>
                    </div>
                    <DataTable
                        columns={appointmentColumns}
                        data={appointments}
                        loading={loading}
                        emptyMessage="No appointments found"
                    />
                </div>
            )}

            {/* Patients Tab */}
            {activeTab === 'patients' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold flex items-center">
                            <User className="w-5 h-5 mr-2 text-green-600" />
                            Patients
                        </h2>
                        <div className="flex space-x-2">
                            <input
                                type="text"
                                placeholder="Search patients..."
                                className="border border-gray-300 rounded px-3 py-1 text-sm w-64"
                            />
                        </div>
                    </div>
                    <DataTable
                        columns={patientColumns}
                        data={patients}
                        loading={loading}
                        emptyMessage="No patients found"
                    />
                </div>
            )}

            {/* Lab Tests Tab */}
            {activeTab === 'labs' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold flex items-center">
                            <Activity className="w-5 h-5 mr-2 text-green-600" />
                            Laboratory Tests
                        </h2>
                        <div className="flex space-x-2">
                            <select className="border border-gray-300 rounded px-3 py-1 text-sm">
                                <option>All Status</option>
                                <option>Pending</option>
                                <option>Completed</option>
                            </select>
                        </div>
                    </div>
                    <DataTable
                        columns={labColumns}
                        data={labs}
                        loading={loading}
                        emptyMessage="No lab tests found"
                    />
                </div>
            )}

            {/* Pharmacy Tab */}
            {activeTab === 'pharmacy' && (
                <div className="bg-white rounded-xl shadow-md p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold flex items-center">
                            <Pill className="w-5 h-5 mr-2 text-green-600" />
                            Pharmacy
                        </h2>
                        <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm">
                            Prescribe Medicine
                        </button>
                    </div>
                    <div className="text-center py-12">
                        <Pill className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-600">Pharmacy Management</h3>
                        <p className="text-gray-500 mt-2">View and prescribe medications to your patients</p>
                        <button className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">
                            Coming Soon
                        </button>
                    </div>
                </div>
            )}
        </Layout>
    );
}

// StatCard Component
function StatCard({ icon: Icon, title, value, color, loading }) {
    const colorClasses = {
        green: 'bg-green-100 text-green-600',
        blue: 'bg-blue-100 text-blue-600',
        orange: 'bg-orange-100 text-orange-600',
        red: 'bg-red-100 text-red-600'
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between">
                <div className={`w-12 h-12 rounded-full ${colorClasses[color]} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">{title}</p>
                    <p className="text-2xl font-bold">
                        {loading ? '...' : value}
                    </p>
                </div>
            </div>
        </div>
    );
}

// StatusBadge Component
function StatusBadge({ status }) {
    const statusClasses = {
        pending: 'bg-yellow-100 text-yellow-800',
        completed: 'bg-green-100 text-green-800',
        confirmed: 'bg-blue-100 text-blue-800',
        cancelled: 'bg-red-100 text-red-800'
    };

    return (
        <span className={`px-2 py-1 text-xs rounded-full capitalize ${statusClasses[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    );
}
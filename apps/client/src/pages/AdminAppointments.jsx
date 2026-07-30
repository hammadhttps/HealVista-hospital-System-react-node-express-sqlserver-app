import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Appointment ID', accessor: 'appointment_id' },
    { header: 'Patient ID', accessor: 'patient_id' },
    { header: 'Doctor ID', accessor: 'doctor_id' },
    { header: 'Appointment Date', accessor: 'appointment_date' },
    { header: 'Status', accessor: 'status' },
];

export default function AdminAppointments() {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAppointments() {
            setLoading(true);
            try {
                // Fetch all doctors' appointments (assuming admin can see all)
                const res = await fetch('/api/appointments');
                const data = await res.json();
                setAppointments(data);
            } catch {
                setAppointments([]);
            }
            setLoading(false);
        }
        fetchAppointments();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Appointments Management</h1>
            <Table columns={columns} data={appointments} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
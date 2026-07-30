import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Doctor ID', accessor: 'doctor_id' },
    { header: 'Full Name', accessor: 'full_name' },
    { header: 'Specialization', accessor: 'specialization' },
    { header: 'Availability', accessor: 'availability_schedule' },
    { header: 'Feedback Score', accessor: 'feedback_score' },
];

export default function AdminDoctors() {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDoctors() {
            setLoading(true);
            try {
                const res = await fetch('/api/doctors');
                const data = await res.json();
                setDoctors(data);
            } catch {
                setDoctors([]);
            }
            setLoading(false);
        }
        fetchDoctors();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Doctors Management</h1>
            <Table columns={columns} data={doctors} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
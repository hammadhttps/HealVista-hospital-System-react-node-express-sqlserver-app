import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Patient ID', accessor: 'patient_id' },
    { header: 'Full Name', accessor: 'full_name' },
    { header: 'Date of Birth', accessor: 'date_of_birth' },
    { header: 'Gender', accessor: 'gender' },
    { header: 'Contact Info', accessor: 'contact_info' },
    { header: 'Registration Date', accessor: 'registration_date' },
];

export default function AdminPatients() {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPatients() {
            setLoading(true);
            try {
                const res = await fetch('/api/appoint_patients');
                const data = await res.json();
                setPatients(data);
            } catch {
                setPatients([]);
            }
            setLoading(false);
        }
        fetchPatients();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Patients Management</h1>
            <Table columns={columns} data={patients} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
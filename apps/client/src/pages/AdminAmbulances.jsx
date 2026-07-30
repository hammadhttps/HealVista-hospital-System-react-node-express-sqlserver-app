import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Ambulance ID', accessor: 'ambulance_id' },
    { header: 'Vehicle Number', accessor: 'vehicle_number' },
    { header: 'Status', accessor: 'status' },
    { header: 'Last Service Date', accessor: 'last_service_date' },
];

export default function AdminAmbulances() {
    const [ambulances, setAmbulances] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAmbulances() {
            setLoading(true);
            try {
                // If there's an ambulances endpoint, use it. Otherwise, leave as []
                const res = await fetch('/api/ambulances');
                const data = await res.json();
                setAmbulances(data);
            } catch {
                setAmbulances([]);
            }
            setLoading(false);
        }
        fetchAmbulances();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Ambulances Management</h1>
            <Table columns={columns} data={ambulances} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
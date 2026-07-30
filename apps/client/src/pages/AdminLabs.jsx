import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Test ID', accessor: 'test_id' },
    { header: 'Patient ID', accessor: 'patient_id' },
    { header: 'Test Name', accessor: 'test_name' },
    { header: 'Result', accessor: 'result' },
    { header: 'Test Date', accessor: 'test_date' },
];

export default function AdminLabs() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchTests() {
            setLoading(true);
            try {
                const res = await fetch('/api/lab');
                const data = await res.json();
                setTests(data);
            } catch {
                setTests([]);
            }
            setLoading(false);
        }
        fetchTests();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Labs Management</h1>
            <Table columns={columns} data={tests} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
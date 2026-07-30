import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Bill ID', accessor: 'bill_id' },
    { header: 'Patient ID', accessor: 'patient_id' },
    { header: 'Amount', accessor: 'amount' },
    { header: 'Payment Status', accessor: 'payment_status' },
    { header: 'Generated Date', accessor: 'generated_date' },
];

export default function AdminBilling() {
    const [billing, setBilling] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchBilling() {
            setLoading(true);
            try {
                // If there's a billing endpoint, use it. Otherwise, leave as []
                const res = await fetch('/api/billing');
                const data = await res.json();
                setBilling(data);
            } catch {
                setBilling([]);
            }
            setLoading(false);
        }
        fetchBilling();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Billing Management</h1>
            <Table columns={columns} data={billing} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
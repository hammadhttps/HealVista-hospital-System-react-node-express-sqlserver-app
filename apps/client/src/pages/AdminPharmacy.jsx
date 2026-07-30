import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Medicine ID', accessor: 'medicine_id' },
    { header: 'Medicine Name', accessor: 'medicine_name' },
    { header: 'Stock Quantity', accessor: 'stock_quantity' },
    { header: 'Expiry Date', accessor: 'expiry_date' },
];

export default function AdminPharmacy() {
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchMedicines() {
            setLoading(true);
            try {
                const res = await fetch('/api/pharmacy');
                const data = await res.json();
                setMedicines(data);
            } catch {
                setMedicines([]);
            }
            setLoading(false);
        }
        fetchMedicines();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Pharmacy Management</h1>
            <Table columns={columns} data={medicines} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
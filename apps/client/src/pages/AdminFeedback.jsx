import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Feedback ID', accessor: 'feedback_id' },
    { header: 'Patient ID', accessor: 'patient_id' },
    { header: 'Comments', accessor: 'comments' },
    { header: 'Submitted Date', accessor: 'submitted_date' },
];

export default function AdminFeedback() {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchFeedback() {
            setLoading(true);
            try {
                // If there's a feedback endpoint, use it. Otherwise, leave as []
                const res = await fetch('/api/feedback');
                const data = await res.json();
                setFeedback(data);
            } catch {
                setFeedback([]);
            }
            setLoading(false);
        }
        fetchFeedback();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Feedback Management</h1>
            <Table columns={columns} data={feedback} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
import { useEffect, useState } from 'react';
import Layout from '../components/Layout/Layout';
import Table from '../components/UI/Table';

const columns = [
    { header: 'Username', accessor: 'username' },
    { header: 'Full Name', accessor: 'full_name' },
    { header: 'Role', accessor: 'role' },
    { header: 'Email', accessor: 'email' },
    { header: 'Phone', accessor: 'phone' },
];

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchUsers() {
            setLoading(true);
            try {
                const res = await fetch('/api/users');
                const data = await res.json();
                setUsers(data);
            } catch {
                setUsers([]);
            }
            setLoading(false);
        }
        fetchUsers();
    }, []);

    return (
        <Layout>
            <h1 className="text-2xl font-bold mb-6">Users Management</h1>
            <Table columns={columns} data={users} />
            {loading && <div className="text-center text-gray-500 mt-4">Loading...</div>}
        </Layout>
    );
} 
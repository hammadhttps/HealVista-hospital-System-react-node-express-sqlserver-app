import { useState } from 'react';
import { LogIn, HeartPulse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const setAuth = useAuthStore((state) => state.setAuth);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) throw new Error('Invalid credentials');
            const data = await res.json();
            setAuth({ user: data.user, token: data.token, role: data.user.role });
            const role = data.user.role?.toLowerCase();
            if (role === 'admin') navigate('/admin');
            else if (role === 'doctor') navigate('/doctor');
            else if (role === 'patient') navigate('/patient');
            else navigate('/');
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-green-100">

                <div className="flex flex-col items-center mb-4">
                    <div className="mb-4">

                        <img
                            src="logo\logo.png"
                            alt="HealVista Hospital Logo"
                            className="h-20 w-auto"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%234CAF50'/%3E%3Ctext x='50%' y='50%' font-size='20' fill='white' text-anchor='middle' dominant-baseline='middle'%3ELogo%3C/text%3E%3C/svg%3E"
                            }}
                        />
                    </div>
                    <h1 className="text-3xl font-bold text-green-800 mb-2">HealVista</h1>
                    <p className="text-green-600 text-center mb-2">
                        Hospital Management System
                    </p>
                    <div className="flex items-center text-green-500 mb-4">
                        <HeartPulse className="mr-2" />
                        <span className="text-sm">Compassionate Care, Digital Excellence</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-gray-600 mb-1 text-sm font-medium">Username</label>
                        <input
                            type="text"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            autoFocus
                            placeholder="Enter your username"
                        />
                    </div>
                    <div>
                        <label className="block text-gray-600 mb-1 text-sm font-medium">Password</label>
                        <input
                            type="password"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="Enter your password"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className={`w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition shadow-md hover:shadow-lg ${loading ? 'opacity-75 cursor-not-allowed' : ''}`}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Authenticating...
                            </>
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                Login to Dashboard
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                    <p className="text-sm text-gray-500">
                        Forgot your password?{' '}
                        <a href="#" className="text-green-600 hover:text-green-800 font-medium">
                            Reset here
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
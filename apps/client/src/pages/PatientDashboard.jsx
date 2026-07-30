import { useEffect, useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Calendar, HeartPulse, Stethoscope, Pill, Activity, Ambulance, Star, ClipboardList } from 'lucide-react';

export default function PatientDashboard() {
    const user = useAuthStore((state) => state.user);
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('appointments');
    const [appointments, setAppointments] = useState([]);
    const [medicines, setMedicines] = useState([]);
    const [labTests, setLabTests] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [feedback, setFeedback] = useState('');
    const [rating, setRating] = useState(0);

    useEffect(() => {
        if (!user) navigate('/login');
        // Fetch initial data
        fetchPatientData();
    }, [user, navigate]);

    const fetchPatientData = async () => {
        try {
            // Fetch appointments
            const appointmentsRes = await fetch(`/api/appointments/patient/${user.user_id}`);
            const appointmentsData = await appointmentsRes.json();
            setAppointments(appointmentsData);

            // Fetch all medicines and filter by patient_id if possible
            const medicinesRes = await fetch(`/api/pharmacy/`);
            const medicinesData = await medicinesRes.json();
            // If medicines have a patient_id field, filter by user.user_id
            const filteredMeds = Array.isArray(medicinesData) && medicinesData.length > 0 && medicinesData[0].patient_id !== undefined
                ? medicinesData.filter(med => med.patient_id === user.user_id)
                : medicinesData;
            setMedicines(filteredMeds);

            // Fetch lab tests
            const labTestsRes = await fetch(`/api/lab/patient/${user.user_id}`);
            const labTestsData = await labTestsRes.json();
            setLabTests(labTestsData);

            // Fetch available doctors
            const doctorsRes = await fetch('/api/doctors/');
            const doctorsData = await doctorsRes.json();
            setDoctors(doctorsData);
        } catch (error) {
            console.error('Error fetching patient data:', error);
        }
    };

    const handleBookAppointment = async (doctorId) => {
        try {
            const res = await fetch('/api/appointments/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: user.id,
                    doctor_id: doctorId,
                    date: new Date().toISOString().split('T')[0],
                    status: 'pending'
                })
            });
            if (res.ok) {
                alert('Appointment booked successfully!');
                fetchPatientData();
            }
        } catch (error) {
            console.error('Error booking appointment:', error);
        }
    };

    const handleSubmitFeedback = async (appointmentId) => {
        try {
            const res = await fetch('/api/appointments/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appointment_id: appointmentId,
                    patient_id: user.id,
                    rating,
                    feedback
                })
            });
            if (res.ok) {
                alert('Feedback submitted successfully!');
                setFeedback('');
                setRating(0);
                fetchPatientData();
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
        }
    };

    const requestAmbulance = async () => {
        try {
            const res = await fetch('/api/ambulances/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: user.id,
                    status: 'requested'
                })
            });
            if (res.ok) {
                alert('Ambulance requested successfully!');
            }
        } catch (error) {
            console.error('Error requesting ambulance:', error);
        }
    };

    return (
        <div className="min-h-screen bg-green-50">
            {/* Header */}
            <header className="bg-green-700 text-white p-4 shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-2xl font-bold flex items-center">
                        <HeartPulse className="mr-2" />
                        HealVista Patient Portal
                    </h1>
                    <div className="flex items-center space-x-4">
                        <span className="font-medium">Welcome, {user?.full_name}</span>
                        <button
                            onClick={() => navigate('/login')}
                            className="bg-green-800 hover:bg-green-900 px-4 py-2 rounded-lg transition"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="container mx-auto p-4">
                {/* Navigation Tabs */}
                <div className="flex border-b border-green-200 mb-6">
                    {[
                        { id: 'appointments', icon: Calendar, label: 'Appointments' },
                        { id: 'doctors', icon: Stethoscope, label: 'Doctors' },
                        { id: 'medicines', icon: Pill, label: 'Medicines' },
                        { id: 'lab', icon: Activity, label: 'Lab Reports' },
                        { id: 'ambulance', icon: Ambulance, label: 'Ambulance' },
                        { id: 'hospital', icon: ClipboardList, label: 'Hospital Info' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            className={`flex items-center px-4 py-2 ${activeTab === tab.id ? 'border-b-2 border-green-600 text-green-700 font-medium' : 'text-gray-600 hover:text-green-600'}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon className="w-5 h-5 mr-2" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    {/* Appointments Tab */}
                    {activeTab === 'appointments' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <Calendar className="mr-2 text-green-600" />
                                Your Appointments
                            </h2>
                            {appointments.length > 0 ? (
                                <div className="space-y-4">
                                    {appointments.map((appt) => (
                                        <div key={appt.id} className="border border-green-100 rounded-lg p-4 hover:bg-green-50 transition">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-medium">Dr. {appt.doctor_name}</h3>
                                                    <p className="text-sm text-gray-600">{new Date(appt.date).toLocaleString()}</p>
                                                    <span className={`px-2 py-1 text-xs rounded-full ${appt.status === 'completed' ? 'bg-green-100 text-green-800' : appt.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                        {appt.status}
                                                    </span>
                                                </div>
                                                {appt.status === 'completed' && !appt.feedback && (
                                                    <button
                                                        onClick={() => document.getElementById(`feedback-modal-${appt.id}`).showModal()}
                                                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                                                    >
                                                        Give Feedback
                                                    </button>
                                                )}
                                            </div>

                                            {/* Feedback Modal */}
                                            <dialog id={`feedback-modal-${appt.id}`} className="modal">
                                                <div className="modal-box bg-white p-6 rounded-lg shadow-xl">
                                                    <h3 className="font-bold text-lg mb-4">Feedback for Dr. {appt.doctor_name}</h3>
                                                    <div className="mb-4">
                                                        <label className="block mb-2">Rating</label>
                                                        <div className="flex space-x-1">
                                                            {[1, 2, 3, 4, 5].map((star) => (
                                                                <Star
                                                                    key={star}
                                                                    className={`w-6 h-6 cursor-pointer ${rating >= star ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                                                    onClick={() => setRating(star)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <textarea
                                                        className="w-full border border-gray-300 rounded p-2 mb-4"
                                                        rows="4"
                                                        placeholder="Your feedback..."
                                                        value={feedback}
                                                        onChange={(e) => setFeedback(e.target.value)}
                                                    ></textarea>
                                                    <div className="flex justify-end space-x-2">
                                                        <button
                                                            onClick={() => document.getElementById(`feedback-modal-${appt.id}`).close()}
                                                            className="px-4 py-2 border rounded"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleSubmitFeedback(appt.id);
                                                                document.getElementById(`feedback-modal-${appt.id}`).close();
                                                            }}
                                                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                                                        >
                                                            Submit
                                                        </button>
                                                    </div>
                                                </div>
                                            </dialog>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500">You have no appointments yet.</p>
                            )}
                        </div>
                    )}

                    {/* Doctors Tab */}
                    {activeTab === 'doctors' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <Stethoscope className="mr-2 text-green-600" />
                                Available Doctors
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {doctors.map((doctor) => (
                                    <div key={doctor.id} className="border border-green-100 rounded-lg p-4 hover:shadow-md transition">
                                        <h3 className="font-medium text-lg">Dr. {doctor.full_name}</h3>
                                        <p className="text-sm text-gray-600 mb-2">{doctor.specialization}</p>
                                        <p className="text-sm mb-3">{doctor.availability}</p>
                                        <button
                                            onClick={() => handleBookAppointment(doctor.id)}
                                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm w-full"
                                        >
                                            Book Appointment
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Medicines Tab */}
                    {activeTab === 'medicines' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <Pill className="mr-2 text-green-600" />
                                Available Medicines
                            </h2>
                            {medicines.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="table-auto w-full">
                                        <thead>
                                            <tr className="bg-green-100">
                                                <th className="px-4 py-2 text-left">Medicine Name</th>
                                                <th className="px-4 py-2 text-left">Stock Quantity</th>
                                                <th className="px-4 py-2 text-left">Expiry Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {medicines.map((med, index) => (
                                                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                                                    <td className="border px-4 py-2">{med.medicine_name}</td>
                                                    <td className="border px-4 py-2">{med.stock_quantity}</td>
                                                    <td className="border px-4 py-2">{med.expiry_date}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-gray-500">No medicines available.</p>
                            )}
                        </div>
                    )}

                    {/* Lab Reports Tab */}
                    {activeTab === 'lab' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <Activity className="mr-2 text-green-600" />
                                Your Lab Reports
                            </h2>
                            {labTests.length > 0 ? (
                                <div className="space-y-4">
                                    {labTests.map((test) => (
                                        <div key={test.id} className="border border-green-100 rounded-lg p-4 hover:bg-green-50 transition">
                                            <div className="flex justify-between">
                                                <div>
                                                    <h3 className="font-medium">{test.test_name}</h3>
                                                    <p className="text-sm text-gray-600">Date: {new Date(test.date).toLocaleDateString()}</p>
                                                </div>
                                                <span className={`px-2 py-1 text-xs rounded-full ${test.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {test.status}
                                                </span>
                                            </div>
                                            {test.status === 'completed' && (
                                                <div className="mt-2">
                                                    <p className="text-sm"><span className="font-medium">Result:</span> {test.result}</p>
                                                    <p className="text-sm"><span className="font-medium">Notes:</span> {test.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500">No lab tests found.</p>
                            )}
                        </div>
                    )}

                    {/* Ambulance Tab */}
                    {activeTab === 'ambulance' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <Ambulance className="mr-2 text-green-600" />
                                Emergency Ambulance Service
                            </h2>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                                <Ambulance className="w-16 h-16 mx-auto text-red-500 mb-4" />
                                <h3 className="text-xl font-medium mb-2">Need Emergency Assistance?</h3>
                                <p className="mb-6">Our ambulance service is available 24/7. Click below to request immediate help.</p>
                                <button
                                    onClick={requestAmbulance}
                                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium shadow-md hover:shadow-lg transition"
                                >
                                    Request Ambulance Now
                                </button>
                                <div className="mt-6 text-sm text-gray-600">
                                    <p>For immediate life-threatening emergencies, please call:</p>
                                    <p className="text-xl font-bold text-red-600 mt-1">102 (Emergency Helpline)</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hospital Info Tab */}
                    {activeTab === 'hospital' && (
                        <div>
                            <h2 className="text-xl font-semibold mb-4 flex items-center">
                                <ClipboardList className="mr-2 text-green-600" />
                                Hospital Information
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-green-50 rounded-lg p-6">
                                    <h3 className="font-medium text-lg mb-3 text-green-700">Contact Information</h3>
                                    <ul className="space-y-2">
                                        <li className="flex items-start">
                                            <svg className="w-5 h-5 mr-2 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                            </svg>
                                            <span>Emergency: <strong>102</strong></span>
                                        </li>
                                        <li className="flex items-start">
                                            <svg className="w-5 h-5 mr-2 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            <span>Email: <strong>info@healvista.com</strong></span>
                                        </li>
                                        <li className="flex items-start">
                                            <svg className="w-5 h-5 mr-2 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span>Address: <strong>123 Health Street, Medical City, MC 12345</strong></span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="bg-green-50 rounded-lg p-6">
                                    <h3 className="font-medium text-lg mb-3 text-green-700">Hospital Hours</h3>
                                    <ul className="space-y-2">
                                        <li className="flex justify-between">
                                            <span>Emergency Department:</span>
                                            <strong>24/7</strong>
                                        </li>
                                        <li className="flex justify-between">
                                            <span>Outpatient Services:</span>
                                            <strong>8:00 AM - 8:00 PM</strong>
                                        </li>
                                        <li className="flex justify-between">
                                            <span>Pharmacy:</span>
                                            <strong>7:00 AM - 11:00 PM</strong>
                                        </li>
                                        <li className="flex justify-between">
                                            <span>Visiting Hours:</span>
                                            <strong>10:00 AM - 8:00 PM</strong>
                                        </li>
                                    </ul>
                                </div>
                                <div className="md:col-span-2 bg-green-50 rounded-lg p-6">
                                    <h3 className="font-medium text-lg mb-3 text-green-700">Our Services</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[
                                            'Emergency Care', 'Cardiology', 'Neurology', 'Pediatrics',
                                            'Oncology', 'Orthopedics', 'Radiology', 'Physical Therapy',
                                            'Laboratory', 'Pharmacy', 'Ambulance', 'ICU'
                                        ].map((service) => (
                                            <div key={service} className="flex items-center">
                                                <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                {service}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


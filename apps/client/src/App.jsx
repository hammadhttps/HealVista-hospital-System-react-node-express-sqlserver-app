import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import PatientDashboard from './pages/PatientDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminDoctors from './pages/AdminDoctors';
import AdminPatients from './pages/AdminPatients';
import AdminAppointments from './pages/AdminAppointments';
import AdminPharmacy from './pages/AdminPharmacy';
import AdminLabs from './pages/AdminLabs';
import AdminBilling from './pages/AdminBilling';
import AdminAmbulances from './pages/AdminAmbulances';
import AdminFeedback from './pages/AdminFeedback';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/doctors" element={<AdminDoctors />} />
        <Route path="/admin/patients" element={<AdminPatients />} />
        <Route path="/admin/appointments" element={<AdminAppointments />} />
        <Route path="/admin/pharmacy" element={<AdminPharmacy />} />
        <Route path="/admin/labs" element={<AdminLabs />} />
        <Route path="/admin/billing" element={<AdminBilling />} />
        <Route path="/admin/ambulances" element={<AdminAmbulances />} />
        <Route path="/admin/feedback" element={<AdminFeedback />} />
        <Route path="/doctor" element={<DoctorDashboard />} />
        <Route path="/patient" element={<PatientDashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

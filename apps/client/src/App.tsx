import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "./lib/queryClient";
import { ProtectedRoute, RoleRoute } from "./components/ProtectedRoute";
import { SocketProvider } from "./components/SocketProvider";
import { AppShell } from "./components/AppShell";
import Landing from "./pages/Landing";
import LoginPage from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmail from "./pages/VerifyEmail";
import PatientRegistration from "./pages/PatientRegistration";
import PatientList from "./pages/PatientList";
import PatientDetail from "./pages/PatientDetail";
import DepartmentManagement from "./pages/DepartmentManagement";
import HospitalSettings from "./pages/HospitalSettings";
import StaffManagement from "./pages/StaffManagement";
import HolidayCalendar from "./pages/HolidayCalendar";
import AccountSettings from "./pages/AccountSettings";
import DoctorSearch from "./pages/DoctorSearch";
import DoctorProfile from "./pages/DoctorProfile";
import BookingConfirm from "./pages/BookingConfirm";
import MyAppointments from "./pages/MyAppointments";
import DoctorSchedule from "./pages/DoctorSchedule";
import LiveQueue from "./pages/LiveQueue";
import NotificationPreferences from "./pages/NotificationPreferences";
import ChatPage from "./pages/ChatPage";
import ReceptionDesk from "./pages/ReceptionDesk";
import QueueDisplay from "./pages/QueueDisplay";
import FavouriteDoctors from "./pages/FavouriteDoctors";
import MyBills from "./pages/MyBills";
import BillingConsole from "./pages/BillingConsole";
import PaymentHistory from "./pages/PaymentHistory";
import Referrals from "./pages/Referrals";
import MyReferrals from "./pages/MyReferrals";
import MyRecords from "./pages/MyRecords";
import SOAPNoteEditor from "./pages/SOAPNoteEditor";
import PrescriptionEditor from "./pages/PrescriptionEditor";
import { AdminDashboard, DoctorDashboard, PatientDashboard } from "./pages/Dashboard";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SocketProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* Authenticated routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                path="/admin"
                element={
                  <RoleRoute role="ADMIN">
                    <AdminDashboard />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/departments"
                element={
                  <RoleRoute role="ADMIN">
                    <DepartmentManagement />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <RoleRoute role="ADMIN">
                    <HospitalSettings />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/staff"
                element={
                  <RoleRoute role="ADMIN">
                    <StaffManagement />
                  </RoleRoute>
                }
              />
              <Route
                path="/admin/holidays"
                element={
                  <RoleRoute role="ADMIN">
                    <HolidayCalendar />
                  </RoleRoute>
                }
              />
              <Route
                path="/doctor"
                element={
                  <RoleRoute role="DOCTOR">
                    <DoctorDashboard />
                  </RoleRoute>
                }
              />
              <Route
                path="/doctor/schedule"
                element={
                  <RoleRoute role="DOCTOR">
                    <DoctorSchedule />
                  </RoleRoute>
                }
              />
              <Route
                path="/doctor/queue"
                element={
                  <RoleRoute role="DOCTOR">
                    <LiveQueue />
                  </RoleRoute>
                }
              />
              <Route
                path="/referrals"
                element={
                  <RoleRoute role="DOCTOR">
                    <Referrals />
                  </RoleRoute>
                }
              />
              <Route
                path="/consultation/:appointmentId"
                element={
                  <RoleRoute role="DOCTOR">
                    <SOAPNoteEditor />
                  </RoleRoute>
                }
              />
              <Route
                path="/prescriptions/:appointmentId"
                element={
                  <RoleRoute role="DOCTOR">
                    <PrescriptionEditor />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient"
                element={
                  <RoleRoute role="PATIENT">
                    <PatientDashboard />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient/appointments"
                element={
                  <RoleRoute role="PATIENT">
                    <MyAppointments />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient/favourites"
                element={
                  <RoleRoute role="PATIENT">
                    <FavouriteDoctors />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient/bills"
                element={
                  <RoleRoute role="PATIENT">
                    <MyBills />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient/referrals"
                element={
                  <RoleRoute role="PATIENT">
                    <MyReferrals />
                  </RoleRoute>
                }
              />
              <Route
                path="/patient/records"
                element={
                  <RoleRoute role="PATIENT">
                    <MyRecords />
                  </RoleRoute>
                }
              />
              <Route
                path="/reception"
                element={
                  <RoleRoute role={["RECEPTIONIST", "ADMIN"]}>
                    <ReceptionDesk />
                  </RoleRoute>
                }
              />
              <Route
                path="/billing"
                element={
                  <RoleRoute role={["ACCOUNTANT", "RECEPTIONIST", "ADMIN"]}>
                    <BillingConsole />
                  </RoleRoute>
                }
              />
              <Route
                path="/billing/payments"
                element={
                  <RoleRoute role={["ACCOUNTANT", "RECEPTIONIST", "ADMIN"]}>
                    <PaymentHistory />
                  </RoleRoute>
                }
              />

              {/* Shared routes */}
              <Route path="/doctors" element={<DoctorSearch />} />
              <Route path="/doctors/:id" element={<DoctorProfile />} />
              <Route path="/booking/confirm" element={<BookingConfirm />} />
              <Route path="/patients" element={<PatientList />} />
              <Route path="/patients/register" element={<PatientRegistration />} />
              <Route path="/patients/:id" element={<PatientDetail />} />
              <Route path="/notifications/preferences" element={<NotificationPreferences />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/settings" element={<AccountSettings />} />
            </Route>

            {/* Waiting-room screen: full-bleed, no AppShell chrome. Still authenticated —
                it renders patient information, masked but not public. */}
            <Route
              path="/queue/display/:doctorId"
              element={
                <ProtectedRoute>
                  <QueueDisplay />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

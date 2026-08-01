import { Suspense, lazy } from "react";
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
import OAuthCallback from "./pages/OAuthCallback";

/**
 * Route-level code splitting.
 *
 * Every page below is fetched only when its route is first visited. Before
 * this the app shipped as a single 1.45 MB chunk, so signing in meant
 * downloading Recharts, the chat client, the knowledge base and all seven
 * dashboards before the login form could render — on a phone on hospital wifi,
 * most of that is for a page the user will never open.
 *
 * The pages an unauthenticated visitor can land on (landing, login, password
 * reset, email verification, the OAuth callback) stay in the entry bundle: they
 * are the critical path, and lazy-loading them would only add a round trip.
 */
const PatientRegistration = lazy(() => import("./pages/PatientRegistration"));
const PatientList = lazy(() => import("./pages/PatientList"));
const PatientDetail = lazy(() => import("./pages/PatientDetail"));
const DepartmentManagement = lazy(() => import("./pages/DepartmentManagement"));
const HospitalSettings = lazy(() => import("./pages/HospitalSettings"));
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const HolidayCalendar = lazy(() => import("./pages/HolidayCalendar"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const DoctorSearch = lazy(() => import("./pages/DoctorSearch"));
const DoctorProfile = lazy(() => import("./pages/DoctorProfile"));
const BookingConfirm = lazy(() => import("./pages/BookingConfirm"));
const MyAppointments = lazy(() => import("./pages/MyAppointments"));
const DoctorSchedule = lazy(() => import("./pages/DoctorSchedule"));
const LiveQueue = lazy(() => import("./pages/LiveQueue"));
const NotificationPreferences = lazy(() => import("./pages/NotificationPreferences"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const ReceptionDesk = lazy(() => import("./pages/ReceptionDesk"));
const QueueDisplay = lazy(() => import("./pages/QueueDisplay"));
const FavouriteDoctors = lazy(() => import("./pages/FavouriteDoctors"));
const MyBills = lazy(() => import("./pages/MyBills"));
const BillingConsole = lazy(() => import("./pages/BillingConsole"));
const PaymentHistory = lazy(() => import("./pages/PaymentHistory"));
const Referrals = lazy(() => import("./pages/Referrals"));
const MyReferrals = lazy(() => import("./pages/MyReferrals"));
const MyRecords = lazy(() => import("./pages/MyRecords"));
const SOAPNoteEditor = lazy(() => import("./pages/SOAPNoteEditor"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const PrescriptionEditor = lazy(() => import("./pages/PrescriptionEditor"));
const Pharmacy = lazy(() => import("./pages/Pharmacy"));
const Lab = lazy(() => import("./pages/Lab"));
const MyLabResults = lazy(() => import("./pages/MyLabResults"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));

// The dashboard module exports one component per role from a single file.
const AdminDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.AdminDashboard })),
);
const DoctorDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.DoctorDashboard })),
);
const PatientDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.PatientDashboard })),
);
const ReceptionistDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.ReceptionistDashboard })),
);
const PharmacistDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.PharmacistDashboard })),
);
const LabDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.LabDashboard })),
);
const AccountantDashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.AccountantDashboard })),
);

/**
 * Shown while a route's chunk is in flight.
 *
 * Deliberately minimal and centred rather than a skeleton: the wait is one
 * network request for a script, usually under a second, and a detailed skeleton
 * that is replaced immediately reads as a flash of broken layout.
 */
function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900"
    >
      <span className="sr-only">Loading</span>
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-700 dark:border-t-blue-400"
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SocketProvider>
          <Toaster position="top-right" richColors />
          {/*
            One boundary around the whole route tree. A lazy component that
            suspends without one throws, so this is required, not optional — and
            keeping it here rather than per-route means a chunk that is already
            cached swaps in with no flash at all.
          */}
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              {/* Google OAuth lands here with the token pair in the URL fragment. */}
              <Route path="/oauth/callback" element={<OAuthCallback />} />

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
                  path="/admin/analytics"
                  element={
                    <RoleRoute role="ADMIN">
                      <AdminAnalytics />
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
                  path="/patient/lab-results"
                  element={
                    <RoleRoute role="PATIENT">
                      <MyLabResults />
                    </RoleRoute>
                  }
                />
                {/* Each staff role gets a KPI dashboard alongside its workspace page. */}
                <Route
                  path="/reception/dashboard"
                  element={
                    <RoleRoute role={["RECEPTIONIST", "ADMIN"]}>
                      <ReceptionistDashboard />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/pharmacy/dashboard"
                  element={
                    <RoleRoute role={["PHARMACIST", "ADMIN"]}>
                      <PharmacistDashboard />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/lab/dashboard"
                  element={
                    <RoleRoute role={["LAB_TECHNICIAN", "ADMIN"]}>
                      <LabDashboard />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/billing/dashboard"
                  element={
                    <RoleRoute role={["ACCOUNTANT", "ADMIN"]}>
                      <AccountantDashboard />
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
                  path="/pharmacy"
                  element={
                    <RoleRoute role={["PHARMACIST", "ADMIN"]}>
                      <Pharmacy />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/lab"
                  element={
                    <RoleRoute role={["LAB_TECHNICIAN", "ADMIN"]}>
                      <Lab />
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

                {/* Staff knowledge base — RAG over policies/FAQs; ADMIN writes. */}
                <Route
                  path="/kb"
                  element={
                    <RoleRoute
                      role={[
                        "DOCTOR",
                        "RECEPTIONIST",
                        "PHARMACIST",
                        "LAB_TECHNICIAN",
                        "ACCOUNTANT",
                        "ADMIN",
                      ]}
                    >
                      <KnowledgeBase />
                    </RoleRoute>
                  }
                />
                <Route
                  path="/kb/:id"
                  element={
                    <RoleRoute
                      role={[
                        "DOCTOR",
                        "RECEPTIONIST",
                        "PHARMACIST",
                        "LAB_TECHNICIAN",
                        "ACCOUNTANT",
                        "ADMIN",
                      ]}
                    >
                      <KnowledgeBase />
                    </RoleRoute>
                  }
                />
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
          </Suspense>
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

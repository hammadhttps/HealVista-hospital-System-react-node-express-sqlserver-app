import AssistantChat from "../components/ai/AssistantChat";
import AIDisclaimer from "../components/ai/AIDisclaimer";
import AnalyticsAssistant from "../components/ai/AnalyticsAssistant";
import { Link } from "react-router-dom";

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardCard title="Users" value="-" />
        <DashboardCard title="Departments" value="-" />
        <DashboardCard title="Appointments" value="-" />
      </div>
      <AnalyticsAssistant />
    </div>
  );
}

export function DoctorDashboard() {
  return <DashboardLayout title="Doctor Dashboard" />;
}

export function PatientDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Patient Dashboard</h1>
        <p className="text-sm text-gray-500">
          Ask about your own records — answers are retrieved from your health history and cited.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AssistantChat role="PATIENT" title="Ask about your health" />
        <div className="space-y-4">
          <QuickLinks />
          <AIDisclaimer />
        </div>
      </div>
    </div>
  );
}

function DashboardLayout({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-gray-500">Dashboard KPIs will be available in Phase 6.</p>
    </div>
  );
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-gray-500 text-sm">{title}</h3>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

const QUICK_LINKS = [
  { to: "/patient/records", label: "My health records" },
  { to: "/patient/lab-results", label: "My lab results" },
  { to: "/patient/appointments", label: "My appointments" },
  { to: "/patient/bills", label: "My bills" },
];

function QuickLinks() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 mb-3">Quick links</h3>
      <div className="space-y-2">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="block rounded-md border border-gray-100 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

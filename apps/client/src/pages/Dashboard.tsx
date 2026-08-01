import { Link } from "react-router-dom";
import AssistantChat from "../components/ai/AssistantChat";
import AIDisclaimer from "../components/ai/AIDisclaimer";
import AnalyticsAssistant from "../components/ai/AnalyticsAssistant";
import { RoleDashboard } from "../components/dashboard/RoleDashboard";

/**
 * Role dashboards (Phase 6.1).
 *
 * Each export is the same `RoleDashboard` — the KPI set is chosen server-side
 * from the caller's role — plus whatever extra surface that role needs.
 */

export function AdminDashboard() {
  return (
    <RoleDashboard title="Admin Dashboard">
      <div className="flex flex-wrap gap-3">
        <Link
          to="/admin/analytics"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open operational analytics
        </Link>
      </div>
      <AnalyticsAssistant />
    </RoleDashboard>
  );
}

export function DoctorDashboard() {
  return <RoleDashboard title="Doctor Dashboard" />;
}

export function ReceptionistDashboard() {
  return <RoleDashboard title="Reception Dashboard" />;
}

export function PharmacistDashboard() {
  return <RoleDashboard title="Pharmacy Dashboard" />;
}

export function LabDashboard() {
  return <RoleDashboard title="Laboratory Dashboard" />;
}

export function AccountantDashboard() {
  return <RoleDashboard title="Accounts Dashboard" />;
}

export function PatientDashboard() {
  return (
    <RoleDashboard title="Patient Dashboard">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AssistantChat role="PATIENT" title="Ask about your health" />
        <div className="space-y-4">
          <QuickLinks />
          <AIDisclaimer />
        </div>
      </div>
    </RoleDashboard>
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
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">Quick links</h3>
      <div className="space-y-2">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="block rounded-md border border-gray-100 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-300 dark:hover:bg-gray-700/50"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

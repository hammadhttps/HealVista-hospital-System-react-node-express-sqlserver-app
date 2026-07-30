import { useAuthStore } from "../store/authStore";
import { useMe } from "../hooks/queries/useAuth";
import { CardSkeleton } from "../components/primitives/Skeleton";

export function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardCard title="Users" value="-" />
        <DashboardCard title="Departments" value="-" />
        <DashboardCard title="Appointments" value="-" />
      </div>
    </div>
  );
}

export function DoctorDashboard() {
  return <DashboardLayout title="Doctor Dashboard" />;
}

export function PatientDashboard() {
  return <DashboardLayout title="Patient Dashboard" />;
}

function DashboardLayout({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-gray-500">
        Dashboard KPIs will be available in Phase 6.
      </p>
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

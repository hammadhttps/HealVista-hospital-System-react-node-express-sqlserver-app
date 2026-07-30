import { useParams } from "react-router-dom";
import { usePatient } from "../hooks/queries/usePatients";
import { CardSkeleton } from "../components/primitives/Skeleton";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = usePatient(id!);

  if (isLoading) return <CardSkeleton />;
  if (isError) return <div className="text-red-500">Patient not found</div>;
  if (!data) return null;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Patients", href: "/patients" },
          { label: data.fullName },
        ]}
      />
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">{data.fullName}</h1>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-500">MRN:</span>{" "}
            <span className="font-mono">{data.mrn}</span>
          </div>
          <div>
            <span className="text-gray-500">Email:</span> {data.user?.email}
          </div>
          <div>
            <span className="text-gray-500">Phone:</span>{" "}
            {data.user?.phone || "-"}
          </div>
          <div>
            <span className="text-gray-500">Gender:</span> {data.gender || "-"}
          </div>
          <div>
            <span className="text-gray-500">Blood Group:</span>{" "}
            {data.bloodGroup || "-"}
          </div>
          <div>
            <span className="text-gray-500">Marital Status:</span>{" "}
            {data.maritalStatus || "-"}
          </div>
        </div>
      </div>
    </div>
  );
}

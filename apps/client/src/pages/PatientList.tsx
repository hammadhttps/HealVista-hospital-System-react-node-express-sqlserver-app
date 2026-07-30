import { useState } from "react";
import { usePatients } from "../hooks/queries/usePatients";
import { TableSkeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";
import { Link } from "react-router-dom";

export default function PatientList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = usePatients({ search, page, limit: 20 });

  return (
    <div>
      <Breadcrumbs items={[{ label: "Patients" }]} />
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Patients</h1>
        <Link
          to="/patients/register"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + Register Patient
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search by name, MRN, or phone..."
        className="w-full border p-2 rounded-lg mb-4"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      {isLoading && <TableSkeleton />}
      {isError && <div className="text-red-500">Failed to load patients</div>}
      {data?.data?.length === 0 && <EmptyState title="No patients found" />}
      {data?.data?.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">MRN</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Gender</th>
                <th className="text-left p-3">Blood Group</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-sm">{p.mrn}</td>
                  <td className="p-3">
                    <Link
                      to={`/patients/${p.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {p.fullName}
                    </Link>
                  </td>
                  <td className="p-3">{p.user?.email}</td>
                  <td className="p-3">{p.gender}</td>
                  <td className="p-3">{p.bloodGroup}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.meta && (
            <div className="p-3 flex justify-between items-center text-sm text-gray-500">
              <span>
                Page {data.meta.page} of {Math.ceil(data.meta.total / 20)}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  disabled={data.data.length < 20}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useDepartments } from "../hooks/queries/useDepartments";
import { TableSkeleton } from "../components/primitives/Skeleton";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";

export default function DepartmentManagement() {
  const { data, isLoading } = useDepartments();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Departments" }]} />
      <h1 className="text-2xl font-bold mb-4">Department Management</h1>
      {isLoading && <TableSkeleton />}
      {data && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Slug</th>
                <th className="text-left p-3">Description</th>
                <th className="text-left p-3">Doctors</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d: any) => (
                <tr key={d.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3 text-sm text-gray-500">{d.slug}</td>
                  <td className="p-3 text-sm">{d.description || "-"}</td>
                  <td className="p-3">{d.doctors?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

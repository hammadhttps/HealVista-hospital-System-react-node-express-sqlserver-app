import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStaff } from "../hooks/queries/useStaff";
import { useUpdateStaff } from "../hooks/mutations/useStaffMutations";
import { useDepartments } from "../hooks/queries/useDepartments";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";

export default function StaffManagement() {
  const { t } = useTranslation(["common", "staff"]);
  const { data: staff, isLoading, isError } = useStaff();
  const { data: departments } = useDepartments();
  const update = useUpdateStaff();
  const [editId, setEditId] = useState<string | null>(null);

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (isError) return <EmptyState title={t("staff:loadFailed")} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{t("staff:title")}</h1>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("staff:employeeCode")}
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("staff:designation")}
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("staff:department")}
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("common:status")}
              </th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(staff as any[])?.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-4">{s.employeeCode}</td>
                <td className="p-4">
                  {editId === s.id ? (
                    <input
                      className="border rounded px-2 py-1 w-32"
                      defaultValue={s.designation ?? ""}
                      onBlur={(e) => {
                        update.mutate({ userId: s.userId, data: { designation: e.target.value } });
                        setEditId(null);
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditId(s.id)}
                      className="cursor-pointer hover:text-green-600"
                    >
                      {s.designation || "—"}
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <select
                    className="border rounded px-2 py-1"
                    value={s.departmentId ?? ""}
                    onChange={(e) =>
                      update.mutate({
                        userId: s.userId,
                        data: { departmentId: e.target.value || undefined },
                      })
                    }
                  >
                    <option value="">—</option>
                    {(departments as any[])?.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-4">
                  <select
                    className="border rounded px-2 py-1"
                    value={s.status}
                    onChange={(e) =>
                      update.mutate({ userId: s.userId, data: { status: e.target.value } })
                    }
                  >
                    <option value="active">{t("staff:active")}</option>
                    <option value="inactive">{t("staff:inactive")}</option>
                    <option value="suspended">{t("staff:suspended")}</option>
                  </select>
                </td>
                <td className="p-4">{update.isPending ? "..." : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

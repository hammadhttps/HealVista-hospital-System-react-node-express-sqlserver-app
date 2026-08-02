import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHolidays } from "../hooks/queries/useHolidays";
import { useCreateHoliday, useDeleteHoliday } from "../hooks/mutations/useHolidayMutations";
import { useDepartments } from "../hooks/queries/useDepartments";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";

export default function HolidayCalendar() {
  const { t } = useTranslation(["common", "holidays"]);
  const { data: holidays, isLoading, isError } = useHolidays();
  const { data: departments } = useDepartments();
  const create = useCreateHoliday();
  const remove = useDeleteHoliday();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ name, date, departmentId: departmentId || undefined });
    setName("");
    setDate("");
    setDepartmentId("");
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (isError) return <EmptyState title={t("holidays:loadFailed")} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{t("holidays:title")}</h1>

      <form onSubmit={handleAdd} className="bg-white rounded-xl shadow-sm p-6 flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {t("holidays:holidayName")}
          </label>
          <input
            className="border rounded-lg px-3 py-2 w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">{t("common:date")}</label>
          <input
            type="date"
            className="border rounded-lg px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {t("holidays:departmentOptional")}
          </label>
          <select
            className="border rounded-lg px-3 py-2"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">{t("holidays:allDepartments")}</option>
            {(departments as any[])?.map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {t("holidays:add")}
        </button>
      </form>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("holidays:name")}
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("common:date")}
              </th>
              <th className="text-left p-4 text-sm font-medium text-gray-500">
                {t("holidays:department")}
              </th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(holidays as any[])?.map((h: any) => (
              <tr key={h.id}>
                <td className="p-4">{h.name}</td>
                <td className="p-4">{new Date(h.date).toLocaleDateString()}</td>
                <td className="p-4">{h.department?.name || t("common:all")}</td>
                <td className="p-4">
                  <button
                    onClick={() => remove.mutate(h.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    {t("common:delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePatients } from "../hooks/queries/usePatients";
import { useMe } from "../hooks/queries/useAuth";
import { TableSkeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";
import { Breadcrumbs } from "../components/primitives/Breadcrumbs";
import SemanticSearchBar from "../components/ai/SemanticSearchBar";
import { Link } from "react-router-dom";

export default function PatientList() {
  const { t } = useTranslation(["common", "patients"]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = usePatients({ search, page, limit: 20 });
  const { data: me } = useMe();
  const isDoctor = me?.role === "DOCTOR";

  return (
    <div>
      <Breadcrumbs items={[{ label: t("patients:title") }]} />
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{t("patients:title")}</h1>
        <Link
          to="/patients/register"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + {t("patients:create")}
        </Link>
      </div>

      {isDoctor && (
        <div className="mb-4">
          <SemanticSearchBar />
        </div>
      )}

      <input
        type="text"
        placeholder={t("patients:searchPlaceholder")}
        className="w-full border p-2 rounded-lg mb-4"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      {isLoading && <TableSkeleton />}
      {isError && <div className="text-red-500">{t("patients:loadFailed")}</div>}
      {data?.data?.length === 0 && <EmptyState title={t("patients:empty")} />}
      {data?.data?.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">{t("patients:mrn")}</th>
                <th className="text-left p-3">{t("patients:name")}</th>
                <th className="text-left p-3">{t("patients:email")}</th>
                <th className="text-left p-3">{t("patients:gender")}</th>
                <th className="text-left p-3">{t("patients:bloodGroup")}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono text-sm">{p.mrn}</td>
                  <td className="p-3">
                    <Link to={`/patients/${p.id}`} className="text-blue-600 hover:underline">
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
                {t("patients:pageOf", {
                  page: data.meta.page,
                  total: Math.ceil(data.meta.total / 20),
                })}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  {t("common:previous")}
                </button>
                <button
                  disabled={data.data.length < 20}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  {t("common:next")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

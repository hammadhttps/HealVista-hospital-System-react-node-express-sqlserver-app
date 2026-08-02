import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../hooks/queries/useSettings";
import { useUpdateSettings } from "../hooks/mutations/useSettingsMutations";
import { Skeleton } from "../components/primitives/Skeleton";
import { EmptyState } from "../components/primitives/EmptyState";

export default function HospitalSettings() {
  const { t } = useTranslation(["common", "settings"]);
  const { data: settings, isLoading, isError } = useSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState<any>(null);

  const fieldLabels: Record<string, string> = {
    hospitalName: t("settings:hospitalName"),
    address: t("settings:address"),
    timezone: t("settings:timezone"),
    currency: t("settings:currency"),
  };

  const handleSave = () => {
    if (form) update.mutate(form);
  };

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (isError) return <EmptyState title={t("settings:loadFailed")} />;

  const current = form ?? settings;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">{t("settings:title")}</h1>
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        {["hospitalName", "address", "timezone", "currency"].map((field) => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-600 mb-1 capitalize">
              {fieldLabels[field] ?? field.replace(/([A-Z])/g, " $1")}
            </label>
            <input
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-400"
              value={(current as any)?.[field] ?? ""}
              onChange={(e) => setForm({ ...current, [field]: e.target.value })}
            />
          </div>
        ))}
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-75"
        >
          {update.isPending ? t("common:saving") : t("settings:save")}
        </button>
        {update.isSuccess && <p className="text-green-600 text-sm">{t("settings:saved")}</p>}
      </div>
    </div>
  );
}

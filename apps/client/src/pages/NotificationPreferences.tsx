import { useNotificationPreferences } from "../hooks/queries/useNotifications";
import { useUpdateNotificationPreferences } from "../hooks/mutations/useNotificationMutations";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export default function NotificationPreferences() {
  const { t } = useTranslation(["notifications"]);
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const toggle = async (key: string, current: boolean) => {
    try {
      await updatePrefs.mutateAsync({ [key]: !current });
      toast.success(t("notifications:updated"));
    } catch {
      toast.error(t("notifications:updateFailed"));
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">{t("notifications:loading")}</div>;
  }

  const channels = [
    { key: "inAppEnabled", label: t("notifications:inApp"), desc: t("notifications:inAppDesc") },
    { key: "emailEnabled", label: t("notifications:email"), desc: t("notifications:emailDesc") },
    { key: "smsEnabled", label: t("notifications:sms"), desc: t("notifications:smsDesc") },
  ];

  const categories = [
    {
      key: "appointmentReminders",
      label: t("notifications:appointmentReminders"),
      desc: t("notifications:appointmentRemindersDesc"),
    },
    {
      key: "labResults",
      label: t("notifications:labResults"),
      desc: t("notifications:labResultsDesc"),
    },
    {
      key: "marketing",
      label: t("notifications:marketing"),
      desc: t("notifications:marketingDesc"),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">{t("notifications:title")}</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">{t("notifications:channels")}</h2>
        <div className="space-y-3">
          {channels.map((ch) => (
            <label
              key={ch.key}
              className="flex items-center justify-between p-4 bg-white rounded-lg border cursor-pointer hover:bg-gray-50"
            >
              <div>
                <p className="font-medium">{ch.label}</p>
                <p className="text-sm text-gray-500">{ch.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={(prefs as any)?.[ch.key] ?? true}
                onChange={() => toggle(ch.key, (prefs as any)?.[ch.key] ?? true)}
                className="w-5 h-5"
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">{t("notifications:categories")}</h2>
        <div className="space-y-3">
          {categories.map((cat) => (
            <label
              key={cat.key}
              className="flex items-center justify-between p-4 bg-white rounded-lg border cursor-pointer hover:bg-gray-50"
            >
              <div>
                <p className="font-medium">{cat.label}</p>
                <p className="text-sm text-gray-500">{cat.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={(prefs as any)?.[cat.key] ?? true}
                onChange={() => toggle(cat.key, (prefs as any)?.[cat.key] ?? true)}
                className="w-5 h-5"
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

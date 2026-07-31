import { useNotificationPreferences } from "../hooks/queries/useNotifications";
import { useUpdateNotificationPreferences } from "../hooks/mutations/useNotificationMutations";
import { toast } from "sonner";

export default function NotificationPreferences() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const toggle = async (key: string, current: boolean) => {
    try {
      await updatePrefs.mutateAsync({ [key]: !current });
      toast.success("Preference updated");
    } catch {
      toast.error("Failed to update preference");
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading preferences...</div>;
  }

  const channels = [
    { key: "inAppEnabled", label: "In-App Notifications", desc: "Notifications inside the app" },
    { key: "emailEnabled", label: "Email Notifications", desc: "Receive notifications via email" },
    { key: "smsEnabled", label: "SMS Notifications", desc: "Receive notifications via SMS" },
  ];

  const categories = [
    {
      key: "appointmentReminders",
      label: "Appointment Reminders",
      desc: "Reminders before appointments",
    },
    { key: "labResults", label: "Lab Results", desc: "When lab results are ready" },
    { key: "marketing", label: "Marketing", desc: "Promotional and marketing messages" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Notification Preferences</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Channels</h2>
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
        <h2 className="text-lg font-semibold mb-3">Categories</h2>
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

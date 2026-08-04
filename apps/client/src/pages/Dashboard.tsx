import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AssistantChat from "../components/ai/AssistantChat";
import AIDisclaimer from "../components/ai/AIDisclaimer";
import AnalyticsAssistant from "../components/ai/AnalyticsAssistant";
import { RoleDashboard } from "../components/dashboard/RoleDashboard";

/**
 * Role dashboards (Phase 6.1).
 *
 * Each export is the same `RoleDashboard` — the KPI set is chosen server-side
 * from the caller's role — plus whatever extra surface that role needs.
 */

export function AdminDashboard() {
  const { t } = useTranslation("dashboard");
  return (
    <RoleDashboard title={t("admin")}>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/admin/analytics"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("openAnalytics")}
        </Link>
      </div>
      <AnalyticsAssistant />
    </RoleDashboard>
  );
}

export function DoctorDashboard() {
  const { t } = useTranslation("dashboard");
  return <RoleDashboard title={t("doctor")} />;
}

export function ReceptionistDashboard() {
  const { t } = useTranslation("dashboard");
  return <RoleDashboard title={t("reception")} />;
}

export function PharmacistDashboard() {
  const { t } = useTranslation("dashboard");
  return <RoleDashboard title={t("pharmacy")} />;
}

export function LabDashboard() {
  const { t } = useTranslation("dashboard");
  return <RoleDashboard title={t("laboratory")} />;
}

export function AccountantDashboard() {
  const { t } = useTranslation("dashboard");
  return <RoleDashboard title={t("accounts")} />;
}

export function PatientDashboard() {
  const { t } = useTranslation("dashboard");
  return (
    <RoleDashboard title={t("patient")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AssistantChat role="PATIENT" title={t("askAboutHealth")} />
        <div className="space-y-4">
          <QuickLinks />
          <AIDisclaimer />
        </div>
      </div>
    </RoleDashboard>
  );
}

const QUICK_LINKS: { to: string; key: string }[] = [
  { to: "/patient/records", key: "myRecords" },
  { to: "/patient/lab-results", key: "myLabResults" },
  { to: "/patient/appointments", key: "myAppointments" },
  { to: "/patient/bills", key: "myBills" },
];

function QuickLinks() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t("quickLinks")}</h3>
      <div className="space-y-2">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="block rounded-md border border-border px-3 py-2 text-sm text-primary hover:bg-accent hover:text-accent-foreground"
          >
            {t(l.key)}
          </Link>
        ))}
      </div>
    </div>
  );
}

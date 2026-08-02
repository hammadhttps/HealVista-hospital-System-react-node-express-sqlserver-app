import { useTranslation } from "react-i18next";
import { useMe } from "../hooks/queries/useAuth";
import { useActingPatientStore } from "../store/actingPatientStore";
import RecordsPanel from "../components/records/RecordsPanel";
import { CardSkeleton } from "../components/primitives/Skeleton";

/**
 * The patient's own health records. When a guardian is acting for a dependant, this
 * shows the dependant's documents — the acting-patient store drives which record the
 * "mine" endpoint resolves.
 */
export default function MyRecords() {
  const { t } = useTranslation(["common", "records"]);
  const { data: me } = useMe();
  const actingPatientId = useActingPatientStore((s) => s.actingPatientId);
  const patientId = actingPatientId ?? (me?.patient?.id as string | undefined);

  if (!patientId) return <CardSkeleton />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("records:title")}</h1>
      <p className="text-sm text-gray-500">{t("records:intro")}</p>
      <RecordsPanel patientId={patientId} mine />
    </div>
  );
}

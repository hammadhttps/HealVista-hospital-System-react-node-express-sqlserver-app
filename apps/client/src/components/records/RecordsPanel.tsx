import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { usePatientRecords, useMyRecords } from "../../hooks/queries/useLabAndPharmacy";
import { useDeleteRecord } from "../../hooks/mutations/useLabPharmacyMutations";
import { recordApi } from "../../api/pharmacy";
import { RECORD_CATEGORIES } from "./ReportUploader";
import ReportUploader from "./ReportUploader";
import ReportViewer, { type RecordRow } from "./ReportViewer";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";

/**
 * A patient's records, in both shapes: the staff per-patient panel (any role with
 * clinical access) and the patient's own "mine" panel that respects the acting
 * patient (a guardian viewing a dependant). The two differ only in which endpoint
 * backs the list, so one component covers both.
 */
export default function RecordsPanel({
  patientId,
  mine = false,
  canUpload = true,
  canDelete = false,
}: {
  patientId?: string;
  mine?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
}) {
  const { t } = useTranslation(["records", "common"]);
  const [category, setCategory] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const minePatientId = mine ? patientId : undefined;
  // In mine mode the patient-only endpoint is used (and the per-patient one disabled);
  // in staff mode the reverse. Each query is gated so a mode never fires the other's
  // request — staff hitting /records/mine would 403, and patients have no business
  // resolving an arbitrary /patients/:id list.
  const forPatient = usePatientRecords(mine ? "" : (patientId ?? ""), category || undefined);
  const mineRecords = useMyRecords(category || undefined, minePatientId, mine);

  const records = ((mine ? mineRecords.data : forPatient.data) ?? []) as RecordRow[];
  const isLoading = mine ? mineRecords.isLoading : forPatient.isLoading;

  const deleteRecord = useDeleteRecord(patientId ?? "");

  async function exportVault() {
    setExporting(true);
    try {
      // Patient mode without a dependant passes nothing — the server resolves the
      // acting patient. Staff always target the patient on screen.
      const blob = await recordApi.exportVault(mine ? minePatientId : patientId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "health-vault.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("records:vaultDownloaded"));
    } catch (e) {
      toast.error((e as Error).message || t("records:exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">{t("common:filter")}</label>
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("records:allCategories")}</option>
            {RECORD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={exportVault} disabled={exporting}>
          <Download className="h-4 w-4" /> {t("records:exportVault")}
        </Button>
      </div>

      {canUpload && <ReportUploader patientId={patientId ?? ""} />}

      <Card>
        <CardContent className="space-y-3 p-4">
          <ReportViewer
            records={records}
            isLoading={isLoading}
            canDelete={canDelete}
            onDelete={(id, title) => {
              if (!window.confirm(t("records:deleteConfirm", { title }))) return;
              deleteRecord.mutate(id, {
                onSuccess: () => toast.success(t("records:deleted")),
                onError: (e) => toast.error(e.message),
              });
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

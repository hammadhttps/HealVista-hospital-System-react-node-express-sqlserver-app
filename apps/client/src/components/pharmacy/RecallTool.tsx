import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Phone } from "lucide-react";
import { useMedicines, useRecallPreview, useRecalls } from "../../hooks/queries/useLabAndPharmacy";
import { useRecallBatch } from "../../hooks/mutations/useLabPharmacyMutations";
import { format } from "date-fns";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Skeleton } from "../primitives/Skeleton";
import { EmptyState } from "../primitives/EmptyState";

interface MedicineOption {
  id: string;
  name: string;
}

interface AffectedPatient {
  id: string;
  fullName: string;
  mrn: string;
  user?: { phone?: string | null };
}

/**
 * Batch recall — the tool that turns "this batch is contaminated" into "these
 * patients received it". The preview shows exactly who will be contacted before the
 * pharmacist commits, because a recall notifies real patients.
 */
export default function RecallTool() {
  const [medicineId, setMedicineId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [reason, setReason] = useState("");

  const { data: medicines } = useMedicines({ pageSize: 100 });
  const preview = useRecallPreview(medicineId, batchNumber.trim());
  const recall = useRecallBatch();
  const { data: recalls, isLoading } = useRecalls();

  const affected = (preview.data?.patients as AffectedPatient[] | undefined) ?? [];

  const confirmRecall = () => {
    if (!reason.trim()) {
      toast.error("A recall needs a reason");
      return;
    }
    recall.mutate(
      { medicineId, batchNumber: batchNumber.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Recall sent — ${preview.data?.patientsAffected ?? 0} patient(s) notified`);
          setBatchNumber("");
          setReason("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Recall a batch
          </h2>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Medicine</label>
            <select
              className={inputClass}
              value={medicineId}
              onChange={(e) => setMedicineId(e.target.value)}
            >
              <option value="">Select medicine…</option>
              {((medicines as unknown as { items: MedicineOption[] } | undefined)?.items ?? []).map(
                (m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Batch number</label>
            <input
              className={inputClass}
              placeholder="e.g. AMX-2026-A"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Reason</label>
            <textarea
              className={`${inputClass} min-h-16`}
              placeholder="Why is this batch being recalled?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">
              {preview.isFetching ? "Checking ledger…" : `${affected.length} patient(s) affected`}
            </p>
            <Button
              onClick={confirmRecall}
              disabled={!medicineId || !batchNumber.trim() || !affected.length || recall.isPending}
            >
              {recall.isPending ? "Sending…" : "Confirm recall"}
            </Button>
          </div>

          {affected.length > 0 && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {affected.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{p.fullName}</span>
                    <span className="ml-2 text-xs text-gray-500">MRN {p.mrn}</span>
                  </div>
                  {p.user?.phone ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="h-3 w-3" /> {p.user.phone}
                    </span>
                  ) : (
                    <Badge variant="outline">No phone</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">Past recalls</h2>
          {isLoading && <Skeleton className="h-40" />}
          {!isLoading && (!recalls || recalls.length === 0) && (
            <EmptyState title="No recalls yet" description="Recalled batches appear here." />
          )}
          {!isLoading && recalls && recalls.length > 0 && (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {recalls.map((r: any) => (
                <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {r.medicine?.name ?? "Medicine"} · batch {r.batchNumber}
                    </span>
                    <span className="text-xs text-gray-500">
                      {format(new Date(r.recalledAt), "yyyy-MM-dd")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {r.reason} — {r.patientsNotified} patient(s) notified
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

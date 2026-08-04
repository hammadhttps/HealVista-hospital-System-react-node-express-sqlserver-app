import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UploadCloud, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { useUploadRecord } from "../../hooks/mutations/useLabPharmacyMutations";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpeg", "jpg"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the server cap.

export const RECORD_CATEGORIES = [
  { value: "lab_report", labelKey: "records:catLabReport" },
  { value: "imaging", labelKey: "records:catImaging" },
  { value: "prescription", labelKey: "records:catPrescription" },
  { value: "discharge_summary", labelKey: "records:catDischargeSummary" },
  { value: "referral", labelKey: "records:catReferral" },
  { value: "insurance", labelKey: "records:catInsurance" },
  { value: "other", labelKey: "records:catOther" },
] as const;

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  error?: string;
  state: "pending" | "uploading" | "done" | "failed";
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Browser → Cloudinary direct upload, gated by a server-issued signature.
 * The file never transits our API; the signature constrains where it may land and
 * the patient's folder is derived server-side, so an upload can never cross patients.
 * Multiple files can be queued at once, with client-side validation and preview for
 * images before anything is sent.
 */
export default function ReportUploader({
  patientId,
  disabled,
}: {
  patientId: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation(["records", "common"]);
  const upload = useUploadRecord(patientId);
  const [category, setCategory] = useState<string>("other");
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);

  function validate(file: File): string | null {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return t("records:onlyPdfPngJpeg");
    if (file.size > MAX_BYTES) return t("records:sizeLimit");
    return null;
  }

  function addFiles(list: FileList | null) {
    if (disabled || !list || list.length === 0) return;
    const next: PendingFile[] = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: isImage(file) ? URL.createObjectURL(file) : undefined,
      error: validate(file) ?? undefined,
      state: "pending",
    }));
    const invalid = next.filter((f) => f.error);
    if (invalid.length > 0) {
      toast.error(invalid.map((f) => f.error).join(" "));
    }
    setPending((prev) => [...prev, ...next]);
  }

  function update(id: string, patch: Partial<PendingFile>) {
    setPending((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function uploadOne(pf: PendingFile) {
    update(pf.id, { state: "uploading" });
    upload.mutate(
      { file: pf.file, title: pf.file.name, category: category || undefined },
      {
        onSuccess: () => {
          update(pf.id, { state: "done" });
          toast.success(t("records:uploaded", { name: pf.file.name }));
        },
        onError: () => {
          update(pf.id, { state: "failed" });
          toast.error(t("records:uploadFailed", { name: pf.file.name }));
        },
      },
    );
  }

  function uploadAll() {
    pending.filter((f) => f.state === "pending").forEach(uploadOne);
  }

  function removePending(id: string) {
    const target = pending.find((f) => f.id === id);
    if (target?.preview) URL.revokeObjectURL(target.preview);
    setPending((prev) => prev.filter((f) => f.id !== id));
  }

  const remaining = pending.filter((f) => f.state === "pending").length;
  const uploading = pending.some((f) => f.state === "uploading");

  return (
    <Card className={dragOver ? "border-teal-400" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => !disabled && document.getElementById("record-file-input")?.click()}
          role="button"
          aria-disabled={disabled}
        >
          <UploadCloud className="h-8 w-8 text-gray-400" />
          <p className="text-sm text-gray-600">{t("records:dragDrop")}</p>
          <p className="text-xs text-gray-400">{t("records:dragHint")}</p>
          <input
            id="record-file-input"
            type="file"
            accept=".pdf,.png,.jpeg,.jpg"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {pending.length > 0 && (
          <div className="space-y-2">
            {pending.map((pf) => (
              <div
                key={pf.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {pf.preview ? (
                    <img
                      src={pf.preview}
                      alt={pf.file.name}
                      className="h-10 w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-8 w-8 shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{pf.file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(pf.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {pf.error ? (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-4 w-4" /> {pf.error}
                    </span>
                  ) : pf.state === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : pf.state === "failed" ? (
                    <Button size="xs" variant="outline" onClick={() => uploadOne(pf)}>
                      {t("records:retry")}
                    </Button>
                  ) : (
                    <>
                      {!uploading && (
                        <Button size="xs" variant="outline" onClick={() => uploadOne(pf)}>
                          {t("records:upload")}
                        </Button>
                      )}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => removePending(pf.id)}
                        aria-label={t("records:removeFile", { name: pf.file.name })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">{t("records:category")}</label>
          <select
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={disabled || uploading}
          >
            {RECORD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
          {remaining > 0 && (
            <Button size="sm" onClick={uploadAll} disabled={uploading || disabled}>
              {uploading ? t("records:uploading") : t("records:uploadCount", { count: remaining })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
